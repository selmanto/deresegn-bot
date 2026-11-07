const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://selmantoon_db_user:<db_password>@cluster0.jdz7hsp.mongodb.net/';
const { exec } = require('child_process');


// ቴሌግራም ቦት ስታገናኝ እነዚህን ሁለቱን ብቻ ትቀይራለህ
const BOT_TOKEN = '9287818773:AAFMcBPcMlqRMjDx4YOv6OtabZBFi8TDTIs';
const PUBLIC_URL = 'https://deresegn-bot.onrender.com';

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
    "1001": { balance: 10, referralsCount: 0, referralEarned: 0, transactions: [] }
  },
    pendingDeposits: [],
    pendingWithdrawals: [],
    winnersHistory: [
        { round: 41, room: "300 ብር", first: "Dawd (#4) - 3,000 ብር", second: "Mekdi (#11) - 600 ብር", third: "Kedir (#2) - 300 ብር" }
    ]
};

const AppDataSchema = new mongoose.Schema({
  key: { type: String, default: 'main_db', unique: true },
  data: { type: Object }
});
const AppData = mongoose.model('AppData', AppDataSchema);

// 1. መጀመሪያ ከፋይል ላይ ማንበብ (ካለ)
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
}

// 2. ሰርቨሩ ሲነሳ ቋሚውን ዳታ ከ MongoDB Atlas ማምጣት
if (MONGO_URI && MONGO_URI.startsWith('mongodb')) {
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log('✅ ከ MongoDB Atlas ቋሚ ዳታቤዝ ጋር ተገናኝቷል!');
      const saved = await AppData.findOne({ key: 'main_db' });
      if (saved && saved.data) {
        db = { ...db, ...saved.data };
        console.log('📦 የተጫዋቾች ሂሳብ እና ዳታ ከ MongoDB ተጭኗል!');
      } else {
        await AppData.create({ key: 'main_db', data: db });
      }
    })
    .catch(err => console.error('❌ MongoDB Error:', err.message));
}

// 3. ማንኛውም ለውጥ ሲኖር ወዲያውኑ ወደ MongoDB ማስቀመጥ
function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
  if (mongoose.connection.readyState === 1) {
    AppData.findOneAndUpdate(
      { key: 'main_db' },
      { $set: { data: db } },
      { upsert: true }
    ).catch(() => {});
  }
}

let rooms = {
    "10": { id: "10", title: "የ10 ብር ፈጣን እጣ", stake: 10, totalSlots: 32, prizes: { first: 200, second: 50, third: 20 }, round: 101, timeLeft: 60, status: "betting", slots: {}, lastWinner: null },
    "50": { id: "50", title: "የ50 ብር መደብ", stake: 50, totalSlots: 24, prizes: { first: 800, second: 150, third: 50 }, round: 85, timeLeft: 60, status: "betting", slots: {}, lastWinner: null },
    "100": { id: "100", title: "የ100 ብር መደብ", stake: 100, totalSlots: 16, prizes: { first: 1000, second: 200, third: 100 }, round: 64, timeLeft: 60, status: "betting", slots: {}, lastWinner: null },
    "300": { id: "300", title: "የ300 ብር VIP መደብ", stake: 300, totalSlots: 16, prizes: { first: 3000, second: 600, third: 300 }, round: 42, timeLeft: 60, status: "betting", slots: {}, lastWinner: null }
};

// የ1 ደቂቃ ቆጣሪ እና አውቶማቲክ ቦት
setInterval(() => {
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
}, 1000);

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

app.get('/api/state', (req, res) => {
  const userId = req.query.userId || "1001";
  if (!db.users[userId]) {
    db.users[userId] = { 
      balance: 10, 
      referralsCount: 0, 
      referralEarned: 0, 
      transactions: [
        { type: "🎁 የእንኳን ደህና መጡ ነጻ ቦነስ", amount: 10, status: "Credited", time: "አሁን" }
      ] 
    };
    saveDB();
  }
  res.json({ user: db.users[userId], rooms, winnersHistory: db.winnersHistory });
});

app.post('/api/buy', (req, res) => {
    const { userId = "1001", roomId, numbers, playerName } = req.body;
    const room = rooms[roomId];
    const user = db.users[userId];
    if (!room || room.status !== "betting") return res.status(400).json({ error: "ይህ ዙር ተዘግቷል!" });

    const available = numbers.filter(n => !room.slots[n]);
    if (available.length === 0) return res.status(400).json({ error: "ቁጥሩ ተይዟል!" });

    const totalCost = available.length * room.stake;
    if (user.balance < totalCost) return res.status(400).json({ error: `በቂ ብር የለም! (${totalCost} ብር ያስፈልጋል)` });

    user.balance -= totalCost;
    available.forEach(num => { room.slots[num] = { name: playerName || "ተጫዋች", isBot: false, userId }; });
    user.transactions.unshift({ type: `🎟 ትኬት (${room.stake} ብር #${available.join(',')})`, amount: -totalCost, time: "አሁን" });
    saveDB();

    if (Object.keys(room.slots).length === room.totalSlots) drawRoomWinner(room);
    res.json({ success: true, balance: user.balance });
});

// ለአድሚኑ በቴሌግራም መልዕክት እና ስክሪንሾት መላኪያ ተግባር
async function notifyAdmin(text, screenshot = null, buttons = null) {
  const adminId = db.adminChatId;
  if (!BOT_TOKEN || !adminId) return;

  const replyMarkup = buttons ? { inline_keyboard: buttons } : {
    inline_keyboard: [[{ text: "🛠️ Admin Panel ክፈት", url: `${PUBLIC_URL}/admin.html` }]]
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

// Deposit ወደ Admin ማረጋገጫ ይሄዳል
app.post('/api/deposit', (req, res) => {
  const { userId = "1001", amount, ftNumber, screenshot } = req.body;
  const numAmount = Number(amount);
  if (!numAmount || numAmount < 10 || (!ftNumber && !screenshot)) {
    return res.status(400).json({ error: "ትክክለኛ መጠን እና ደረሰኝ ያስገቡ!" });
  }

  const depId = 'dep_' + Date.now();
  db.pendingDeposits.unshift({
    id: depId, userId, amount: numAmount, ftNumber: ftNumber || 'ፎቶ ብቻ', screenshot: screenshot || null, time: new Date().toLocaleTimeString()
  });
  db.users[userId].transactions.unshift({
    id: depId, type: `⏳ Deposit በመጠባበቅ ላይ`, amount: numAmount, time: "አሁን"
  });
  saveDB();

  // ወዲያውኑ ለአድሚኑ በቴሌግራም ማሳወቅ
  notifyAdmin(
    `🔔 አዲስ የ ${numAmount} ብር Deposit ጥያቄ ገብቷል!\n\n👤 ተጫዋች ID: ${userId}\n💵 መጠን: ${numAmount} ብር\n📩 ደረሰኝ/ሜሴጅ:\n${ftNumber}`,
    screenshot,
    [
      [
        { text: "✅ አጽድቅ (Approve)", callback_data: `appdep_${depId}` },
        { text: "❌ ውድቅ አድርግ (Reject)", callback_data: `rejdep_${depId}` }
      ],
      [{ text: "🛠️ Admin Panel ክፈት", url: `${PUBLIC_URL}/admin.html` }]
    ]
  );

  res.json({ success: true });
});

// Withdraw ወደ Admin ይሄዳል
app.post('/api/withdraw', (req, res) => {
  const { userId = "1001", amount, accountInfo } = req.body;
  const numAmount = Number(amount);
  const user = db.users[userId];
  if (!numAmount || numAmount < 50 || !accountInfo) return res.status(400).json({ error: "ዝቅተኛው ወጪ 50 ብር ነው!" });
  if (user.balance < numAmount) return res.status(400).json({ error: "በቂ ቀሪ ሂሳብ የለም!" });

  user.balance -= numAmount;
  const withId = 'with_' + Date.now();
  db.pendingWithdrawals.unshift({ id: withId, userId, amount: numAmount, accountInfo, time: new Date().toLocaleTimeString() });
  user.transactions.unshift({ id: withId, type: `⏳ Withdraw በመጠባበቅ ላይ (${accountInfo})`, amount: -numAmount, time: "አሁን" });
  saveDB();

  // ወዲያውኑ ለአድሚኑ በቴሌግራም ማሳወቅ
  notifyAdmin(
    `💸 አዲስ የ ${numAmount} ብር Withdraw (ወጪ) ጥያቄ!\n\n👤 ተጫዋች ID: ${userId}\n💰 መጠን: ${numAmount} ብር\n🏦 አካውንት: ${accountInfo}`,
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

// ADMIN APIs
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
    } else {
      user.transactions.unshift({ type: `❌ Deposit ውድቅ ተደርጓል`, amount: 0, time: "አሁን" });
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
    } else {
      user.balance += w.amount;
      user.transactions.unshift({ type: `↩️ Withdraw ተመልሷል`, amount: w.amount, time: "አሁን" });
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

// Telegram Bot ማስነሻ
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN') {
  let lastUpdateId = 0;
  console.log('🤖 የቴሌግራም ቦቱ በቀጥታ ተገናኝቷል!');

  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`);
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;

          // አድሚኑ ከቴሌግራም ላይ በቀጥታ Approve/Reject ሲነካ
          if (update.callback_query) {
            const cb = update.callback_query;
            const cbData = cb.data || '';
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

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: cb.id, text: replyText, show_alert: true })
            });
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: cb.message.chat.id, text: replyText })
            });
          }

          const msg = update.message;
          if (!msg || !msg.text) continue;
          const chatId = msg.chat.id;

          // አድሚኑ ራሱን ለመመዝገብ /setadmin ብሎ ሲልክ
          if (msg.text.startsWith('/setadmin')) {
            db.adminChatId = chatId;
            saveDB();
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `✅ እንኳን ደስ አለዎት! የእርስዎ ቴሌግራም (ID: ${chatId}) እንደ ዋና አድሚን ተመዝግቧል!\nከአሁን ጀምሮ ማንኛውም Deposit ስክሪንሾት እና የሜሴጅ ማረጋገጫ እዚህ ይደርስዎታል።`
              })
            });
          }

          if (msg.text.startsWith('/start')) {
            const firstName = msg.from?.first_name || 'ተጫዋች';
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `🌺 እንኳን ወደ *ደረሰኝ ፈጣን እጣ* በደህና መጡ ${firstName}!\n\n🎯 ከ10 ብር እስከ 300 ብር መደቦች በየደቂቃው ይወጣሉ!\n👇 ለመጫወት ከታች ያለውን ቁልፍ ይጫኑ፦`,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[{ text: "🎲 እጣ ግባ / Play Now", web_app: { url: PUBLIC_URL } }]]
                }
              })
            });
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
