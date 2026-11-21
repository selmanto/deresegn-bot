const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const BOT_TOKEN = '9287818773:AAFMcBPcMlqRMjDx4YOv6OtabZBFi8TDTIs';
const PUBLIC_URL = 'https://deresegn-bot-sips.onrender.com';
const DEFAULT_SUPPORT_URL = 'https://t.me/Deresengsupport';
const MONGO_URI = 'mongodb+srv://selmantoon_db_user:nb7Kam5fxPcwWWS8@cluster0.jdz7hsp.mongodb.net/deresegnbot?retryWrites=true&w=majority';

const MIN_RACE_BET = 10;
const MAX_RACE_BET = 50; // ካፒታልህ ሲያድግ ይህንን ወደ 100 ወይም 200 ማሳደግ ትችላለህ

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

const BOT_NAMES = [
  "kedir", "Dawd", "Mekdi", "Birhane", "ozil", "Yonas", "Abebe", "Sara",
  "Nati", "Bini", "Hana", "Kal", "Dani", "Sami", "Tedi", "Marta",
  "Robel", "Elias", "TG", "Fira", "Alex", "Chala", "Beka", "Lidiya"
];

let db = {
  users: {
    "1001": { name: "Test", balance: 10, phone: null, bonusClaimed: true, referralsCount: 0, referralEarned: 0, referredBy: null, hasDeposited: false, transactions: [] }
  },
  pendingDeposits: [],
  pendingWithdrawals: [],
  winnersHistory: [
    { round: 41, room: "300 ብር", first: "Dawd (#4) - 3,000 ብር", second: "Mekdi (#11) - 600 ብር", third: "Kedir (#2) - 300 ብር" }
  ],
  stats: {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalBets: 0,
    totalWins: 0,
    daily: {}
  },
  adminChatId: null,
  channelId: null,
  channelUrl: null,
  supportUrl: DEFAULT_SUPPORT_URL
};

function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Addis_Ababa' });
}

function getTodayStats() {
  if (!db.stats) {
    db.stats = { totalDeposits: 0, totalWithdrawals: 0, totalBets: 0, totalWins: 0, daily: {} };
  }
  if (!db.stats.daily) db.stats.daily = {};
  const today = getTodayKey();
  if (!db.stats.daily[today]) {
    db.stats.daily[today] = { deposits: 0, withdrawals: 0, bets: 0, wins: 0, newUsers: 0 };
  }
  return { today, d: db.stats.daily[today] };
}

const AppDataSchema = new mongoose.Schema({
  key: { type: String, default: 'main_db', unique: true },
  data: { type: Object }
});
const AppData = mongoose.model('AppData', AppDataSchema);

if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { }
}

if (MONGO_URI && MONGO_URI.startsWith('mongodb')) {
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log('✅ ከ MongoDB Atlas ቋሚ ዳታቤዝ ጋር ተገናኝቷል!');
      const saved = await AppData.findOne({ key: 'main_db' });
      if (saved && saved.data) {
        db = { ...db, ...saved.data };
        getTodayStats();
        console.log('📦 የተጫዋቾች ሂሳብ እና ዳታ ከ MongoDB ተጭኗል!');
        resolveChannelUrl();
      } else {
        await AppData.create({ key: 'main_db', data: db });
      }
    })
    .catch(err => console.error('❌ MongoDB Error:', err.message));
}

function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { }
  if (mongoose.connection.readyState === 1) {
    AppData.findOneAndUpdate(
      { key: 'main_db' },
      { $set: { data: db } },
      { upsert: true }
    ).catch(() => {});
  }
}

async function resolveChannelUrl() {
  if (!db.channelId || !BOT_TOKEN) return;
  const raw = String(db.channelId).trim();
  if (raw.startsWith('https://t.me/')) {
    db.channelUrl = raw;
    saveDB();
    return;
  }
  if (raw.startsWith('@')) {
    db.channelUrl = `https://t.me/${raw.replace('@', '')}`;
    saveDB();
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(raw)}`);
    const d = await r.json();
    if (d.ok && d.result) {
      if (d.result.username) {
        db.channelUrl = `https://t.me/${d.result.username}`;
      } else if (d.result.invite_link) {
        db.channelUrl = d.result.invite_link;
      }
      saveDB();
    }
  } catch (e) {}
}

// ==================== 1. ፈጣን እጣ (DERESEGN ETA) ====================
let rooms = {
  "10": { id: "10", title: "የ10 ብር ፈጣን እጣ", stake: 10, totalSlots: 32, prizes: { first: 200, second: 50, third: 20 }, round: 101, timeLeft: 60, status: "betting", slots: {}, lastWinner: null },
  "50": { id: "50", title: "የ50 ብር መደብ", stake: 50, totalSlots: 24, prizes: { first: 800, second: 150, third: 50 }, round: 85, timeLeft: 60, status: "betting", slots: {}, lastWinner: null },
  "100": { id: "100", title: "የ100 ብር መደብ", stake: 100, totalSlots: 16, prizes: { first: 1000, second: 200, third: 100 }, round: 64, timeLeft: 60, status: "betting", slots: {}, lastWinner: null },
  "300": { id: "300", title: "የ300 ብር VIP መደብ", stake: 300, totalSlots: 16, prizes: { first: 3000, second: 600, third: 300 }, round: 42, timeLeft: 60, status: "betting", slots: {}, lastWinner: null }
};

function drawRoomWinner(room) {
  room.status = "drawing";
  const allSlots = Object.keys(room.slots).map(Number);
  const botSlots = allSlots.filter(n => room.slots[n].isBot);
  const realSlots = allSlots.filter(n => !room.slots[n].isBot);

  let firstWinNum, secondWinNum, thirdWinNum;

  if (botSlots.length === 0 && realSlots.length === room.totalSlots) {
    const shuffled = [...realSlots].sort(() => 0.5 - Math.random());
    [firstWinNum, secondWinNum, thirdWinNum] = shuffled;
  } else {
    const shuffledBots = [...botSlots].sort(() => 0.5 - Math.random());
    firstWinNum = shuffledBots[0] || 1;
    secondWinNum = shuffledBots[1] || shuffledBots[0] || 2;
    const rem = allSlots.filter(n => n !== firstWinNum && n !== secondWinNum);
    thirdWinNum = rem[Math.floor(Math.random() * rem.length)] || 3;
  }

  const creditWinner = (slotNum, prize) => {
    const slot = room.slots[slotNum];
    if (slot && !slot.isBot && db.users[slot.userId]) {
      db.users[slot.userId].balance += prize;
      db.users[slot.userId].transactions.unshift({
        type: `🏆 የእጣ ሽልማት (ዙር #${room.round})`, amount: prize, status: "Credited", time: "አሁን"
      });
      const { d } = getTodayStats();
      d.wins += prize;
      db.stats.totalWins += prize;
      saveDB();
    }
  };

  creditWinner(firstWinNum, room.prizes.first);
  creditWinner(secondWinNum, room.prizes.second);
  creditWinner(thirdWinNum, room.prizes.third);

  const fName = room.slots[firstWinNum]?.name || "ተጫዋች";
  const sName = room.slots[secondWinNum]?.name || "ተጫዋች";
  const tName = room.slots[thirdWinNum]?.name || "ተጫዋች";

  room.lastWinner = { round: room.round, firstNum: firstWinNum, firstName: fName, secondNum: secondWinNum, secondName: sName, thirdNum: thirdWinNum, thirdName: tName };

  db.winnersHistory.unshift({
    round: room.round, room: `${room.stake} ብር`,
    first: `${fName} (#${firstWinNum}) - ${room.prizes.first} ብር`,
    second: `${sName} (#${secondWinNum}) - ${room.prizes.second} ብር`,
    third: `${tName} (#${thirdWinNum}) - ${room.prizes.third} ብር`
  });
  if (db.winnersHistory.length > 15) db.winnersHistory.pop();
  saveDB();

  setTimeout(() => {
    room.round += 1; room.slots = {}; room.timeLeft = 60; room.status = "betting"; room.lastWinner = null;
  }, 6000);
}

// ==================== 2. VIRTUAL RACING (HORSE & DOG — 6 RUNNERS, FAIR FIXED ODDS) ====================
const RACE_ODDS_POOL = [2.9, 3.8, 5.0, 6.5, 9.0, 12.0];
const LANE_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#10b981', '#a855f7', '#f97316'];
const HORSE_NAMES = ['ነብር', 'ንስር', 'መብረቅ', 'አንበሳ', 'ነፋስ', 'ኮከብ'];
const DOG_NAMES = ['ቦቢ', 'ሮኪ', 'ቶሚ', 'ማክስ', 'ላኪ', 'ፍላሽ'];

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildRunners(type) {
  const names = type === 'horse' ? HORSE_NAMES : DOG_NAMES;
  const shuffledOdds = shuffleArray(RACE_ODDS_POOL);
  return names.map((name, idx) => ({
    id: idx + 1,
    name,
    color: LANE_COLORS[idx],
    odd: shuffledOdds[idx]
  }));
}

function pickFairWeightedWinner(runners) {
  const weights = runners.map(r => 1 / r.odd);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < runners.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return runners[i].id;
  }
  return runners[runners.length - 1].id;
}

let races = {
  horse: {
    type: 'horse',
    title: 'የፈረስ ውድድር',
    emoji: '🐎',
    round: 201,
    status: 'betting', // betting (30s) -> racing (12s) -> result (6s)
    timeLeft: 30,
    phaseDuration: 30,
    phaseStartTime: Date.now(),
    runners: buildRunners('horse'),
    bets: [],
    finishOrder: null,
    winnerId: null,
    history: [
      { round: 200, winnerId: 3, name: 'መብረቅ', odd: 5.0, color: LANE_COLORS[2] },
      { round: 199, winnerId: 1, name: 'ነብር', odd: 2.9, color: LANE_COLORS[0] },
      { round: 198, winnerId: 5, name: 'ነፋስ', odd: 9.0, color: LANE_COLORS[4] }
    ]
  },
  dog: {
    type: 'dog',
    title: 'የውሻ ውድድር',
    emoji: '🐕',
    round: 301,
    status: 'betting',
    timeLeft: 20, // ከፈረሱ ጋር በአንድ ሰከንድ እንዳይገጣጠም
    phaseDuration: 30,
    phaseStartTime: Date.now() - 10000,
    runners: buildRunners('dog'),
    bets: [],
    finishOrder: null,
    winnerId: null,
    history: [
      { round: 300, winnerId: 2, name: 'ሮኪ', odd: 3.8, color: LANE_COLORS[1] },
      { round: 299, winnerId: 6, name: 'ፍላሽ', odd: 12.0, color: LANE_COLORS[5] },
      { round: 298, winnerId: 4, name: 'ማክስ', odd: 6.5, color: LANE_COLORS[3] }
    ]
  }
};

function startRaceRun(race) {
  const winnerId = pickFairWeightedWinner(race.runners);
  const others = shuffleArray(race.runners.map(r => r.id).filter(id => id !== winnerId));
  race.winnerId = winnerId;
  race.finishOrder = [winnerId, ...others];
  race.status = 'racing';
  race.timeLeft = 12;
  race.phaseDuration = 12;
  race.phaseStartTime = Date.now();
}

function settleRaceResult(race) {
  race.status = 'result';
  race.timeLeft = 6;
  race.phaseDuration = 6;
  race.phaseStartTime = Date.now();

  const winRunner = race.runners.find(r => r.id === race.winnerId);
  if (winRunner) {
    race.history.unshift({
      round: race.round,
      winnerId: winRunner.id,
      name: winRunner.name,
      odd: winRunner.odd,
      color: winRunner.color
    });
    if (race.history.length > 10) race.history.pop();
  }

  let dbChanged = false;
  for (const bet of race.bets) {
    if (bet.runnerId === race.winnerId && db.users[bet.userId]) {
      const payout = Math.round(bet.amount * bet.odd);
      db.users[bet.userId].balance += payout;
      db.users[bet.userId].transactions.unshift({
        type: `${race.emoji} ${race.title} ሽልማት (#${winRunner.id} ${winRunner.name} x${bet.odd})`,
        amount: payout,
        status: 'Credited',
        time: 'አሁን'
      });
      const { d } = getTodayStats();
      d.wins += payout;
      db.stats.totalWins += payout;
      dbChanged = true;
    }
  }
  if (dbChanged) saveDB();
}

function resetRaceRound(race) {
  race.round += 1;
  race.status = 'betting';
  race.timeLeft = 30;
  race.phaseDuration = 30;
  race.phaseStartTime = Date.now();
  race.runners = buildRunners(race.type);
  race.bets = [];
  race.finishOrder = null;
  race.winnerId = null;
}

// Main 1-second Game Loop (Rooms + Races)
setInterval(() => {
  // Update Eta Rooms
  Object.values(rooms).forEach(room => {
    if (room.status === "betting") {
      room.timeLeft -= 1;
      if (room.timeLeft <= 5 && room.timeLeft > 0) {
        const empty = [];
        for (let i = 1; i <= room.totalSlots; i++) if (!room.slots[i]) empty.push(i);
        const fillCount = room.timeLeft === 1 ? empty.length : Math.ceil(empty.length / room.timeLeft);
        for (let j = 0; j < fillCount; j++) {
          if (empty.length > 0) {
            const slotNum = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
            const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            room.slots[slotNum] = { name: botName, isBot: true, userId: "bot" };
          }
        }
      }
      if (room.timeLeft <= 0) drawRoomWinner(room);
    }
  });

  // Update Virtual Races
  Object.values(races).forEach(race => {
    race.timeLeft -= 1;
    if (race.timeLeft <= 0) {
      if (race.status === 'betting') {
        startRaceRun(race);
      } else if (race.status === 'racing') {
        settleRaceResult(race);
      } else {
        resetRaceRound(race);
      }
    }
  });
}, 1000);

function serializeRacesForUser(userId) {
  const out = {};
  for (const key of Object.keys(races)) {
    const r = races[key];
    out[key] = {
      type: r.type,
      title: r.title,
      emoji: r.emoji,
      round: r.round,
      status: r.status,
      timeLeft: r.timeLeft,
      phaseDuration: r.phaseDuration,
      elapsedMs: Date.now() - r.phaseStartTime,
      runners: r.runners,
      finishOrder: r.status === 'betting' ? null : r.finishOrder,
      winnerId: r.status === 'result' ? r.winnerId : null,
      history: r.history,
      myBets: r.bets.filter(b => b.userId === userId),
      minBet: MIN_RACE_BET,
      maxBet: MAX_RACE_BET
    };
  }
  return out;
}

async function sendMessageToUser(chatId, text, extra = {}) {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...extra })
    });
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    return false;
  }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let botUsername = '';

app.get('/api/state', (req, res) => {
  const userId = String(req.query.userId || "1001");
  if (!db.users[userId]) {
    db.users[userId] = { 
      name: "ተጫዋች",
      balance: 0, 
      phone: null,
      bonusClaimed: false,
      referralsCount: 0, 
      referralEarned: 0, 
      referredBy: null,
      hasDeposited: false,
      transactions: [{ type: "ℹ️ የ10 ብር ነጻ ቦነስ ለማግኘት በቦቱ ላይ ስልክዎን ያጋሩ", amount: 0, status: "Info", time: "አሁን" }] 
    };
    if (userId !== "1001") {
      const { d } = getTodayStats();
      d.newUsers += 1;
    }
    saveDB();
  }
  res.json({
    user: db.users[userId],
    rooms,
    races: serializeRacesForUser(userId),
    winnersHistory: db.winnersHistory,
    botUsername
  });
});

app.post('/api/buy', (req, res) => {
  const { userId = "1001", roomId, numbers, playerName } = req.body;
  const uid = String(userId);
  const room = rooms[roomId];
  const user = db.users[uid];
  if (!room || room.status !== "betting") return res.status(400).json({ error: "ይህ ዙር ተዘግቷል!" });
  if (!user) return res.status(400).json({ error: "ተጫዋች አልተገኘም!" });

  const available = numbers.filter(n => !room.slots[n]);
  if (available.length === 0) return res.status(400).json({ error: "ቁጥሩ ተይዟል!" });

  const totalCost = available.length * room.stake;
  if (user.balance < totalCost) return res.status(400).json({ error: `በቂ ብር የለም! (${totalCost} ብር ያስፈልጋል)` });

  user.balance -= totalCost;
  available.forEach(num => { room.slots[num] = { name: playerName || "ተጫዋች", isBot: false, userId: uid }; });
  user.transactions.unshift({ type: `🎟 ትኬት (${room.stake} ብር #${available.join(',')})`, amount: -totalCost, time: "አሁን" });

  const { d } = getTodayStats();
  d.bets += totalCost;
  db.stats.totalBets += totalCost;
  saveDB();

  if (Object.keys(room.slots).length === room.totalSlots) drawRoomWinner(room);
  res.json({ success: true, balance: user.balance });
});

app.post('/api/race/bet', (req, res) => {
  const { userId = "1001", raceType, runnerId, amount } = req.body;
  const uid = String(userId);
  const race = races[raceType];
  const user = db.users[uid];
  const numAmount = Math.floor(Number(amount));
  const numRunner = Number(runnerId);

  if (!race) return res.status(400).json({ error: "ጨዋታው አልተገኘም!" });
  if (!user) return res.status(400).json({ error: "ተጫዋች አልተገኘም!" });
  if (race.status !== 'betting') return res.status(400).json({ error: "ውድድሩ ተጀምሯል! ቀጣዩን ዙር ይጠብቁ።" });

  const runner = race.runners.find(r => r.id === numRunner);
  if (!runner) return res.status(400).json({ error: "ትክክለኛ ተወዳዳሪ ይምረጡ!" });
  if (!numAmount || numAmount < MIN_RACE_BET || numAmount > MAX_RACE_BET) {
    return res.status(400).json({ error: `መደቡ ከ ${MIN_RACE_BET} እስከ ${MAX_RACE_BET} ብር መሆን አለበት!` });
  }

  const userRoundTotal = race.bets
    .filter(b => b.userId === uid)
    .reduce((sum, b) => sum + b.amount, 0);
  if (userRoundTotal + numAmount > MAX_RACE_BET) {
    return res.status(400).json({ error: `በአንድ ዙር ከ ${MAX_RACE_BET} ብር በላይ መመደብ አይቻልም!` });
  }
  if (user.balance < numAmount) {
    return res.status(400).json({ error: `በቂ ቀሪ ሂሳብ የለም! (${numAmount} ብር ያስፈልጋል)` });
  }

  user.balance -= numAmount;
  const potentialWin = Math.round(numAmount * runner.odd);
  race.bets.push({
    userId: uid,
    runnerId: runner.id,
    runnerName: runner.name,
    color: runner.color,
    amount: numAmount,
    odd: runner.odd,
    potentialWin
  });

  user.transactions.unshift({
    type: `${race.emoji} ${race.title} (#${runner.id} ${runner.name} x${runner.odd})`,
    amount: -numAmount,
    time: "አሁን"
  });

  const { d } = getTodayStats();
  d.bets += numAmount;
  db.stats.totalBets += numAmount;
  saveDB();

  res.json({ success: true, balance: user.balance });
});

async function notifyAdmin(text, screenshot = null, buttons = null) {
  const adminId = db.adminChatId;
  if (!BOT_TOKEN || !adminId) return;

  const replyMarkup = buttons ? { inline_keyboard: buttons } : {
    inline_keyboard: [[{ text: "🛠️ Admin Panel", url: `${PUBLIC_URL}/admin.html` }]]
  };

  try {
    if (screenshot && screenshot.startsWith('data:image')) {
      const base64Data = screenshot.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const form = new FormData();
      form.append('chat_id', adminId);
      form.append('caption', text.slice(0, 1000));
      form.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'receipt.jpg');
      form.append('reply_markup', JSON.stringify(replyMarkup));
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
      return;
    }
  } catch (e) {}

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: adminId, text: text, reply_markup: replyMarkup })
    });
  } catch (e) {}
}

app.post('/api/deposit', (req, res) => {
  const { userId = "1001", amount, ftNumber, screenshot } = req.body;
  const uid = String(userId);
  const numAmount = Number(amount);
  if (!numAmount || numAmount < 10 || (!ftNumber && !screenshot)) {
    return res.status(400).json({ error: "ትክክለኛ መጠን እና ደረሰኝ ያስገቡ!" });
  }

  const user = db.users[uid];
  const depId = 'dep_' + Date.now();
  db.pendingDeposits.unshift({
    id: depId, userId: uid, phone: user?.phone || 'አልተመዘገበም', amount: numAmount, ftNumber: ftNumber || 'ፎቶ ብቻ', screenshot: screenshot || null, time: new Date().toLocaleTimeString()
  });
  user.transactions.unshift({
    id: depId, type: `⏳ Deposit በመጠባበቅ ላይ`, amount: numAmount, time: "አሁን"
  });
  saveDB();

  notifyAdmin(
    `🔔 አዲስ የ ${numAmount} ብር Deposit ጥያቄ ገብቷል!\n\n👤 ተጫዋች: ${user?.name || 'ተጫዋች'} (ID: ${uid})\n📱 ስልክ: ${user?.phone || 'አልተመዘገበም'}\n💵 መጠን: ${numAmount} ብር\n📩 ደረሰኝ/ሜሴጅ:\n${ftNumber}`,
    screenshot,
    [
      [
        { text: "✅ አጽድቅ (Approve)", callback_data: `appdep_${depId}` },
        { text: "❌ ውድቅ አድርግ (Reject)", callback_data: `rejdep_${depId}` }
      ],
      [{ text: "🛠️ Admin Panel", url: `${PUBLIC_URL}/admin.html` }]
    ]
  );

  res.json({ success: true });
});

app.post('/api/withdraw', (req, res) => {
  const { userId = "1001", amount, accountInfo } = req.body;
  const uid = String(userId);
  const numAmount = Number(amount);
  const user = db.users[uid];
  if (!numAmount || numAmount < 50 || !accountInfo) return res.status(400).json({ error: "ዝቅተኛው ወጪ 50 ብር ነው!" });
  if (user.balance < numAmount) return res.status(400).json({ error: "በቂ ቀሪ ሂሳብ የለም!" });

  user.balance -= numAmount;
  const withId = 'with_' + Date.now();
  db.pendingWithdrawals.unshift({ id: withId, userId: uid, phone: user?.phone || 'አልተመዘገበም', amount: numAmount, accountInfo, time: new Date().toLocaleTimeString() });
  user.transactions.unshift({ id: withId, type: `⏳ Withdraw በመጠባበቅ ላይ (${accountInfo})`, amount: -numAmount, time: "አሁን" });
  saveDB();

  notifyAdmin(
    `💸 አዲስ የ ${numAmount} ብር Withdraw ጥያቄ!\n\n👤 ተጫዋች: ${user?.name || 'ተጫዋች'} (ID: ${uid})\n📱 የተመዘገበ ስልክ: ${user?.phone || 'አልተመዘገበም'}\n💰 መጠን: ${numAmount} ብር\n🏦 አካውንት: ${accountInfo}`,
    null,
    [
      [
        { text: "✅ ብሩን ልኬያለሁ (Paid)", callback_data: `appwith_${withId}` },
        { text: "❌ መልስ (Refund)", callback_data: `rejwith_${withId}` }
      ]
    ]
  );

  res.json({ success: true });
});

app.get('/api/admin/data', (req, res) => {
  res.json({ pendingDeposits: db.pendingDeposits, pendingWithdrawals: db.pendingWithdrawals });
});

function processDepositAction(id, action) {
  const idx = db.pendingDeposits.findIndex(d => d.id === id);
  if (idx === -1) return null;
  const dep = db.pendingDeposits.splice(idx, 1)[0];
  const user = db.users[dep.userId];
  if (user) {
    if (action === 'approve') {
      user.balance += dep.amount;
      user.transactions.unshift({ type: `✅ Deposit ጸድቋል`, amount: dep.amount, time: "አሁን" });

      const { d } = getTodayStats();
      d.deposits += dep.amount;
      db.stats.totalDeposits += dep.amount;

      if (user.referredBy && !user.hasDeposited) {
        const inviterId = user.referredBy;
        if (db.users[inviterId]) {
          db.users[inviterId].balance += 20;
          db.users[inviterId].referralsCount = (db.users[inviterId].referralsCount || 0) + 1;
          db.users[inviterId].referralEarned = (db.users[inviterId].referralEarned || 0) + 20;
          db.users[inviterId].transactions.unshift({
            type: `👥 የሪፈራል ኮሚሽን (የተጋባዥ ID: ${dep.userId})`,
            amount: 20,
            status: "Credited",
            time: "አሁን"
          });
          sendMessageToUser(inviterId, `👥 የሪፈራል ኮሚሽን ገቢ ተደረገ!\nየእርስዎ ተጋባዥ የመጀመሪያውን ዲፖዚት ስላደረገ የ 20 ብር ኮሚሽን ወደ ዋሌትዎ ገብቷል። 🎁`);
        }
      }
      user.hasDeposited = true;
      sendMessageToUser(dep.userId, `✅ የ ${dep.amount} ብር Deposit ጥያቄዎ ጸድቶ ወደ ዋሌትዎ ገብቷል! መልካም እድል! 🎲`);
    } else {
      user.transactions.unshift({ type: `❌ Deposit ውድቅ ተደርጓል`, amount: 0, time: "አሁን" });
      sendMessageToUser(dep.userId, `❌ የላኩት የ ${dep.amount} ብር Deposit ደረሰኝ ትክክል ባለመሆኑ ውድቅ ተደርጓል።`);
    }
  }
  saveDB();
  return dep;
}

function processWithdrawAction(id, action) {
  const idx = db.pendingWithdrawals.findIndex(w => w.id === id);
  if (idx === -1) return null;
  const w = db.pendingWithdrawals.splice(idx, 1)[0];
  const user = db.users[w.userId];
  if (user) {
    if (action === 'approve') {
      user.transactions.unshift({ type: `✅ Withdraw ተከፍሏል (${w.accountInfo})`, amount: -w.amount, time: "አሁን" });

      const { d } = getTodayStats();
      d.withdrawals += w.amount;
      db.stats.totalWithdrawals += w.amount;

      sendMessageToUser(w.userId, `💸 የጠየቁት የ ${w.amount} ብር ወጪ (Withdraw) ወደ ${w.accountInfo} ተልኳል! 🎉`);
    } else {
      user.balance += w.amount;
      user.transactions.unshift({ type: `↩️ Withdraw ተመልሷል`, amount: w.amount, time: "አሁን" });
      sendMessageToUser(w.userId, `↩️ የጠየቁት የ ${w.amount} ብር ወጪ ተመላሽ ተደርጎ ወደ ዋሌትዎ ገብቷል።`);
    }
  }
  saveDB();
  return w;
}

app.post('/api/admin/deposit-action', (req, res) => {
  processDepositAction(req.body.id, req.body.action);
  res.json({ success: true });
});

app.post('/api/admin/withdraw-action', (req, res) => {
  processWithdrawAction(req.body.id, req.body.action);
  res.json({ success: true });
});

async function postWinnersToChannel() {
  if (!BOT_TOKEN || !db.channelId || db.winnersHistory.length === 0) return;

  const recentWinners = db.winnersHistory.slice(0, 4).map(w =>
    `🏅 ዙር #${w.round} (${w.room} መደብ)\n   🥇 1ኛ: ${w.first}\n   🥈 2ኛ: ${w.second}\n   🥉 3ኛ: ${w.third}`
  ).join('\n\n');

  const postText = 
    `🎉 የደረሰኝ ፈጣን እጣ — የሰዓቱ አሸናፊዎች! 🎉\n\n` +
    `በየደቂቃው በሚወጣው እጣችን እና በፈረስ/ውሻ ውድድሮቻችን አሸናፊ የሆኑ እድለኞች ሽልማታቸው ወዲያውኑ ወደ ዋሌታቸው ገብቷል! 💸\n\n` +
    `${recentWinners}\n\n` +
    `🔥 ቀጣዩ ዙር አሁን ተጀምሯል!\n` +
    `👇 ለመጫወት ከታች ያለውን ቁልፍ ይጫኑ፦`;

  const playUrl = botUsername ? `https://t.me/${botUsername}?start=channel` : PUBLIC_URL;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: db.channelId,
        text: postText,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎮 አሁኑኑ ይጫወቱ / Play Now", url: playUrl }]
          ]
        }
      })
    });
  } catch (e) {}
}

setInterval(postWinnersToChannel, 60 * 60 * 1000);

// Telegram Bot ማስነሻ
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN') {
  let lastUpdateId = 0;
  console.log('🤖 የቴሌግራም ቦቱ በቀጥታ ተገናኝቷል!');

  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`)
    .then(r => r.json())
    .then(d => { if (d.ok) botUsername = d.result.username; })
    .catch(() => {});

  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`);
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;

          if (update.callback_query) {
            const cb = update.callback_query;
            const cbData = cb.data || '';
            const callerId = String(cb.from.id);

            if (cbData === 'check_balance') {
              const u = db.users[callerId] || { balance: 0, phone: null };
              const balMsg = `💰 የእርስዎ ቀሪ ሂሳብ: ${u.balance} ብር\n📱 ስልክ: ${u.phone || 'አልተረጋገጠም (10 ብር ቦነስ ለማግኘት ስልክዎን ያጋሩ)'}`;
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cb.id, text: balMsg, show_alert: true })
              });
              continue;
            }

            if (cbData === 'my_invite') {
              const u = db.users[callerId] || { referralsCount: 0, referralEarned: 0 };
              const refLink = `https://t.me/${botUsername || 'DeresegnBot'}?start=ref_${callerId}`;
              const shareText = encodeURIComponent(`🎁 ፈጣን እጣ፣ የፈረስ እና የውሻ ውድድር! አሁኑኑ ሲገቡ የ 10 ብር ነጻ ቦነስ ይሰጣል 👇`);
              const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cb.id })
              });

              await sendMessageToUser(
                callerId,
                `👥 ጓደኛ ይጋብዙ — 20 ብር ኮሚሽን ያግኙ!\n\n` +
                `📊 የጋበዟቸው ሰዎች: ${u.referralsCount || 0}\n` +
                `💵 ያገኙት ኮሚሽን: ${u.referralEarned || 0} ብር\n\n` +
                `በእርስዎ ሊንክ የሚገባ ሰው የመጀመሪያውን Deposit ሲያደርግ ወዲያውኑ 20 ብር ወደ ዋሌትዎ ይገባል!\n\n` +
                `👇 የእርስዎ መጋበዣ ሊንክ፦\n${refLink}`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "📤 ለጓደኞችዎ ይላኩ (Share Link)", url: shareUrl }]
                    ]
                  }
                }
              );
              continue;
            }

            if (cbData === 'no_channel') {
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: cb.id,
                  text: "📢 የቴሌግራም ቻናሉን ለማገናኘት በቦቱ ውስጥ /setchannel @የቻናልዎ_ስም ብለው ይላኩ!",
                  show_alert: true
                })
              });
              continue;
            }

            let replyText = '';
            if (cbData.startsWith('appdep_')) {
              const d = processDepositAction(cbData.replace('appdep_', ''), 'approve');
              replyText = d ? `✅ የ ${d.amount} ብር Deposit ጸድቋል!` : '⚠️ ይህ ጥያቄ ቀድሞ ተስተናግዷል።';
            } else if (cbData.startsWith('rejdep_')) {
              const d = processDepositAction(cbData.replace('rejdep_', ''), 'reject');
              replyText = d ? `❌ የ ${d.amount} ብር Deposit ውድቅ ተደርጓል!` : '⚠️ ይህ ጥያቄ ቀድሞ ተስተናግዷል።';
            } else if (cbData.startsWith('appwith_')) {
              const w = processWithdrawAction(cbData.replace('appwith_', ''), 'approve');
              replyText = w ? `✅ የ ${w.amount} ብር ወጪ ተከፍሏል ተብሎ ተመዝግቧል!` : '⚠️ ቀድሞ ተስተናግዷል።';
            } else if (cbData.startsWith('rejwith_')) {
              const w = processWithdrawAction(cbData.replace('rejwith_', ''), 'reject');
              replyText = w ? `↩️ የ ${w.amount} ብር ወጪ ተመላሽ ተደርጓል!` : '⚠️ ቀድሞ ተስተናግዷል።';
            }

            if (replyText) {
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cb.id, text: replyText, show_alert: true })
              });
              await sendMessageToUser(cb.message.chat.id, replyText);
            }
          }

          const msg = update.message || update.channel_post;
          if (!msg) continue;
          const chatId = String(msg.chat.id);

          // 📱 ተጫዋቹ ስልክ ቁጥሩን ሲያጋራ
          if (msg.contact) {
            if (String(msg.contact.user_id) !== String(msg.from?.id)) {
              await sendMessageToUser(chatId, `⚠️ እባክዎ የራስዎን ትክክለኛ የቴሌግራም ስልክ ቁጥር ብቻ ያጋሩ!`);
              continue;
            }

            const rawPhone = msg.contact.phone_number.replace(/[^0-9]/g, '');
            const playerName = msg.from?.first_name || 'ተጫዋች';
            const playerUsername = msg.from?.username ? `@${msg.from.username}` : '';

            if (!db.users[chatId]) {
              db.users[chatId] = { name: playerName, username: playerUsername, balance: 0, phone: null, bonusClaimed: false, referralsCount: 0, referralEarned: 0, referredBy: null, hasDeposited: false, transactions: [] };
            }

            if (!rawPhone.startsWith('251')) {
              await sendMessageToUser(chatId, `❌ የነጻ ቦነስ የሚሰጠው ለኢትዮጵያ (+251) ስልክ ቁጥሮች ብቻ ነው!`, {
                reply_markup: { remove_keyboard: true }
              });
              continue;
            }

            db.users[chatId].phone = '+' + rawPhone;
            db.users[chatId].name = playerName;
            if (playerUsername) db.users[chatId].username = playerUsername;

            if (!db.users[chatId].bonusClaimed) {
              db.users[chatId].bonusClaimed = true;
              db.users[chatId].balance += 10;
              db.users[chatId].transactions.unshift({
                type: "🎁 ስልክ በማረጋገጥ የተገኘ ነጻ ቦነስ", amount: 10, status: "Credited", time: "አሁን"
              });
              saveDB();

              await sendMessageToUser(
                chatId,
                `✅ ስልክ ቁጥርዎ (+${rawPhone}) ተረጋግጧል!\n🎁 የ 10 ብር ነጻ መጫወቻ ቦነስ ወደ ዋሌትዎ ገብቷል! ከላይ Play Now የሚለውን ነክተው መጫወት ይችላሉ።`,
                { reply_markup: { remove_keyboard: true } }
              );
            } else {
              saveDB();
              await sendMessageToUser(chatId, `✅ ስልክ ቁጥርዎ (+${rawPhone}) ተመዝግቧል!`, {
                reply_markup: { remove_keyboard: true }
              });
            }

            if (db.adminChatId) {
              await sendMessageToUser(
                db.adminChatId,
                `📱 አዲስ ተጫዋች ስልክ ቁጥሩን አጋርቷል!\n\n👤 ስም: ${playerName}\n🔗 Username: ${playerUsername || 'የለውም'}\n🆔 ID: ${chatId}\n📞 ስልክ: +${rawPhone}\n💰 ሂሳብ: ${db.users[chatId].balance} ብር`
              );
            }
            continue;
          }

                    // 🖼️ ፎቶ ከነ ጽሑፉ ለሁሉም ተጫዋቾች መላኪያ (/broadcast በፎቶ Caption ላይ)
          if (msg.photo && msg.caption && msg.caption.startsWith('/broadcast')) {
            if (!db.adminChatId || chatId !== String(db.adminChatId)) continue;
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            const broadcastCaption = msg.caption.replace(/^\/broadcast\s*/i, '').trim();
            const allUserIds = Object.keys(db.users).filter(id => id !== "1001");

            await sendMessageToUser(chatId, `⏳ ፎቶውን ለ ${allUserIds.length} ተጫዋቾች በመላክ ላይ...`);
            let sent = 0, failed = 0;
            for (const uid of allUserIds) {
              try {
                const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: uid,
                    photo: photoId,
                    caption: broadcastCaption,
                    reply_markup: {
                      inline_keyboard: [[{ text: "🎮 Play Now / ይጫወቱ", web_app: { url: PUBLIC_URL } }]]
                    }
                  })
                });
                const d = await r.json();
                if (d.ok) sent++; else failed++;
              } catch (e) { failed++; }
              await delay(80);
            }
            await sendMessageToUser(chatId, `📢 የፎቶ Broadcast ተጠናቋል!\n✅ የተላከላቸው: ${sent}\n❌ ያልደረሳቸው: ${failed}`);
            continue;
          }


          if (!msg.text) continue;

          if (msg.text.startsWith('/setsupport')) {
            if (!db.adminChatId || chatId !== String(db.adminChatId)) continue;
            const arg = (msg.text.split(' ')[1] || '').trim();
            if (!arg) {
              await sendMessageToUser(chatId, `ℹ️ አሁን ያለው Support ሊንክ: ${db.supportUrl || DEFAULT_SUPPORT_URL}\n\nለመቀየር:\n/setsupport @አዲስ_Username`);
            } else {
              db.supportUrl = arg.startsWith('http') ? arg : `https://t.me/${arg.replace('@', '')}`;
              saveDB();
              await sendMessageToUser(chatId, `✅ የ Support ቁልፍ ወደ ${db.supportUrl} ተቀይሯል!`);
            }
            continue;
          }

          if (msg.text.startsWith('/setadmin')) {
            if (db.adminChatId && chatId !== String(db.adminChatId)) continue;
            db.adminChatId = chatId;
            saveDB();
            await sendMessageToUser(chatId, `✅ እንኳን ደስ አለዎት! የእርስዎ ቴሌግራም (ID: ${chatId}) እንደ ዋና አድሚን ተመዝግቧል!`);
          }

          if (msg.text.startsWith('/setchannel')) {
            if (db.adminChatId && chatId !== String(db.adminChatId)) continue;
            const parts = msg.text.split(' ');
            const targetChannel = parts[1] ? parts[1].trim() : chatId;
            db.channelId = targetChannel;
            await resolveChannelUrl();
            saveDB();
            await sendMessageToUser(chatId, `✅ ቻናሉ (${db.channelUrl || targetChannel}) በትክክል ተገናኝቷል! የመጀመሪያው የሙከራ ፖስት አሁን ተልኳል!`);
            await postWinnersToChannel();
          }

          if (msg.text.startsWith('/postnow')) {
            if (db.adminChatId && chatId !== String(db.adminChatId)) continue;
            await postWinnersToChannel();
          }

          if (msg.text.startsWith('/stats')) {
            if (!db.adminChatId || chatId !== String(db.adminChatId)) continue;
            const { today, d } = getTodayStats();
            const allUsers = Object.entries(db.users).filter(([id]) => id !== "1001");
            const verifiedCount = allUsers.filter(([, u]) => u.phone).length;
            const totalUserBalances = allUsers.reduce((sum, [, u]) => sum + (Number(u.balance) || 0), 0);
            const pendingDepSum = db.pendingDeposits.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
            const pendingWithSum = db.pendingWithdrawals.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);

            const todayNet = d.deposits - d.withdrawals;
            const totalNet = db.stats.totalDeposits - db.stats.totalWithdrawals;

            const report =
              `📊 የደረሰኝ ጌም — የገቢ ሪፖርት\n` +
              `📅 ቀን: ${today}\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `📌 የዛሬ ሂሳብ (Today)\n` +
              `📥 የጸደቀ Deposit: ${d.deposits.toLocaleString()} ብር\n` +
              `📤 የተከፈለ Withdraw: ${d.withdrawals.toLocaleString()} ብር\n` +
              `💰 የተጣራ የዛሬ ገቢ: ${todayNet.toLocaleString()} ብር\n` +
              `🎟 የዛሬ መደብ ሽያጭ: ${d.bets.toLocaleString()} ብር\n` +
              `🏆 የዛሬ ሽልማት: ${d.wins.toLocaleString()} ብር\n` +
              `👤 ዛሬ የገቡ አዲስ ሰዎች: ${d.newUsers}\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `📈 ጠቅላላ ሂሳብ (All Time)\n` +
              `📥 ጠቅላላ Deposit: ${db.stats.totalDeposits.toLocaleString()} ብር\n` +
              `📤 ጠቅላላ Withdraw: ${db.stats.totalWithdrawals.toLocaleString()} ብር\n` +
              `💵 ጠቅላላ የተጣራ ገቢ: ${totalNet.toLocaleString()} ብር\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `👥 ተጫዋቾች: ${allUsers.length} (ስልክ ያረጋገጡ: ${verifiedCount})\n` +
              `🏦 በተጫዋቾች ዋሌት ያለ: ${totalUserBalances.toLocaleString()} ብር\n` +
              `⏳ Pending Deposit: ${db.pendingDeposits.length} (${pendingDepSum.toLocaleString()} ብር)\n` +
              `⏳ Pending Withdraw: ${db.pendingWithdrawals.length} (${pendingWithSum.toLocaleString()} ብር)`;

            await sendMessageToUser(chatId, report);
            continue;
          }

          if (msg.text.startsWith('/users')) {
            if (!db.adminChatId || chatId !== String(db.adminChatId)) continue;
            const entries = Object.entries(db.users).filter(([id]) => id !== "1001");
            if (entries.length === 0) {
              await sendMessageToUser(chatId, `📋 እስካሁን የተመዘገበ ተጫዋች የለም።`);
            } else {
              const verifiedCount = entries.filter(([, u]) => u.phone).length;
              const list = entries.slice(-30).map(([id, u], idx) =>
                `${idx + 1}. ${u.name || 'ተጫዋች'}${u.username ? ` (${u.username})` : ''} | 📱 ${u.phone || 'አልተረጋገጠም'} | 💰 ${u.balance} ብር`
              ).join('\n');
              await sendMessageToUser(
                chatId,
                `👥 ጠቅላላ ተጫዋቾች: ${entries.length} (ስልክ ያረጋገጡ: ${verifiedCount})\n(የመጨረሻዎቹ 30)፦\n\n${list}`
              );
            }
          }

          if (msg.text.startsWith('/remind')) {
            if (!db.adminChatId || chatId !== String(db.adminChatId)) continue;
            const unverifiedIds = Object.entries(db.users)
              .filter(([id, u]) => id !== "1001" && !u.phone)
              .map(([id]) => id);

            if (unverifiedIds.length === 0) {
              await sendMessageToUser(chatId, `✅ ሁሉም ተጫዋቾች ስልክ ቁጥራቸውን አረጋግጠዋል!`);
              continue;
            }

            await sendMessageToUser(chatId, `⏳ ስልክ ላላጋሩ ${unverifiedIds.length} ተጫዋቾች ማስታወሻ በመላክ ላይ...`);
            let sent = 0, failed = 0;
            for (const uid of unverifiedIds) {
              const ok = await sendMessageToUser(
                uid,
                `🎁 የ 10 ብር ነጻ መጫወቻ ቦነስዎ እየጠበቀዎት ነው!\n\nስልክ ቁጥርዎን አረጋግጠው ወዲያውኑ 10 ብር ነጻ ቦነስ ለመውሰድና ፈጣን እጣ፣ የፈረስ እና የውሻ ውድድር ለመጫወት ከታች ያለውን ቁልፍ ይጫኑ 👇`,
                {
                  reply_markup: {
                    keyboard: [
                      [{ text: "📱 Share Your Phone Number / ስልክ ቁጥር አጋራ", request_contact: true }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                  }
                }
              );
              if (ok) sent++; else failed++;
              await delay(80);
            }
            await sendMessageToUser(chatId, `✅ ማስታወሻው ለ ${sent} ሰዎች በተሳካ ሁኔታ ተልኳል! (${failed} ቦቱን ዘግተውታል/አልደረሳቸውም)`);
          }

          if (msg.text.startsWith('/broadcast')) {
            if (!db.adminChatId || chatId !== String(db.adminChatId)) continue;
            const broadcastMsg = msg.text.replace(/^\/broadcast\s*/i, '').trim();
            if (!broadcastMsg) {
              await sendMessageToUser(chatId, `⚠️ የሚላከውን መልዕክት አብረው ይጻፉ!\n\nምሳሌ፦\n/broadcast 🔥 አዲስ የፈረስ እና የውሻ ውድድር ተጨምሯል! አሁኑኑ ገብተው ይጫወቱ!`);
              continue;
            }

            const allUserIds = Object.keys(db.users).filter(id => id !== "1001");
            await sendMessageToUser(chatId, `⏳ መልዕክቱን ለ ${allUserIds.length} ተጫዋቾች በመላክ ላይ...`);
            let sent = 0, failed = 0;
            for (const uid of allUserIds) {
              const ok = await sendMessageToUser(uid, broadcastMsg, {
                reply_markup: {
                  inline_keyboard: [[{ text: "🎮 Play Now / ይጫወቱ", web_app: { url: PUBLIC_URL } }]]
                }
              });
              if (ok) sent++; else failed++;
              await delay(80);
            }
            await sendMessageToUser(chatId, `📢 Broadcast ተጠናቋል!\n✅ የተላከላቸው: ${sent}\n❌ ያልደረሳቸው: ${failed}`);
          }

          if (msg.text.startsWith('/start')) {
            const firstName = msg.from?.first_name || 'ተጫዋች';
            const username = msg.from?.username ? `@${msg.from.username}` : '';

            if (!db.users[chatId]) {
              db.users[chatId] = {
                name: firstName,
                username: username,
                balance: 0,
                phone: null,
                bonusClaimed: false,
                referralsCount: 0,
                referralEarned: 0,
                referredBy: null,
                hasDeposited: false,
                transactions: [{ type: "ℹ️ የ10 ብር ቦነስ ለማግኘት ስልክዎን ያጋሩ", amount: 0, status: "Info", time: "አሁን" }]
              };
              const { d } = getTodayStats();
              d.newUsers += 1;
            } else {
              db.users[chatId].name = firstName;
              if (username) db.users[chatId].username = username;
            }

            const parts = msg.text.split(' ');
            if (parts[1] && parts[1].startsWith('ref_')) {
              const inviterId = parts[1].replace('ref_', '');
              if (inviterId !== chatId && db.users[inviterId] && !db.users[chatId].referredBy && !db.users[chatId].hasDeposited) {
                db.users[chatId].referredBy = inviterId;
                saveDB();
                sendMessageToUser(inviterId, `👥 አንድ ሰው በእርስዎ ሊንክ ገብቷል!\nመጀመሪያ ዲፖዚት (Deposit) ሲያደርግና ሲጸድቅ የ 20 ብር ኮሚሽን ወደ ዋሌትዎ ይገባል! 🎁`);
              }
            }
            saveDB();

            if (!db.channelUrl && db.channelId) {
              await resolveChannelUrl();
            }

            const channelButton = db.channelUrl
              ? { text: "📢 Channel", url: db.channelUrl }
              : { text: "📢 Channel", callback_data: "no_channel" };

            const supportButton = {
              text: "🆘 Support",
              url: db.supportUrl || DEFAULT_SUPPORT_URL
            };

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `🎉 Welcome To Deresegn Games, ${firstName}! 🎉\n\n🎲 ፈጣን እጣ • 🐎 የፈረስ ውድድር • 🐕 የውሻ ውድድር\n👇 Select an option below:`,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🎮 Play Now", web_app: { url: PUBLIC_URL } }],
                    [
                      { text: "💳 Deposit", web_app: { url: `${PUBLIC_URL}?tab=wallet` } },
                      { text: "🧾 Balance", callback_data: "check_balance" }
                    ],
                    [
                      { text: "🎟 Invite", callback_data: "my_invite" },
                      channelButton
                    ],
                    [supportButton]
                  ]
                }
              })
            });

            if (!db.users[chatId].phone) {
              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `🎁 Please Share Your Phone Number\nየ 10 ብር ነጻ መጫወቻ ቦነስ ለማግኘት ከታች ያለውን ቁልፍ በመጫን ስልክ ቁጥርዎን ያጋሩ 👇`,
                  reply_markup: {
                    keyboard: [
                      [{ text: "📱 Share Your Phone Number / ስልክ ቁጥር አጋራ", request_contact: true }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                  }
                })
              });
            }
          }
        }
      }
    } catch (err) {}
  }, 1500);
}

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ DeresegnBot Server running on port ${PORT}`);
});
