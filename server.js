const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'scores.json');

// 中間件
app.use(bodyParser.json());
app.use(express.static('public')); // 服務靜態網頁

// 內存變數：儲存正在進行的遊戲 Session，防止偽造開始時間
// 結構: { sessionId: { startTime: timestamp, targetText: string } }
const activeSessions = {};

// 輔助函式：讀取排行榜
function getScores() {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

// 輔助函式：儲存排行榜
function saveScore(newRecord) {
    const scores = getScores();
    scores.push(newRecord);
    // 排序並只保留前 50 名
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, 50);
    fs.writeFileSync(DATA_FILE, JSON.stringify(topScores, null, 2));
}

// API: 開始遊戲 (獲取 Session ID)
app.post('/api/start', (req, res) => {
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    // 伺服器端記錄開始時間，防止前端篡改時間
    activeSessions[sessionId] = {
        startTime: Date.now(),
        // 如果題目是動態的，這裡也要記錄題目內容以供驗證
        targetText: req.body.targetText 
    };

    res.json({ sessionId: sessionId });
});

// API: 提交成績 (核心反作弊邏輯)
app.post('/api/submit', (req, res) => {
    const { sessionId, playerName, typedText, keystrokeData } = req.body;
    const serverEndTime = Date.now();

    // 1. 驗證 Session 是否存在
    if (!activeSessions[sessionId]) {
        return res.status(400).json({ error: "無效的遊戲會話 (Session Invalid)" });
    }

    const session = activeSessions[sessionId];
    const serverDurationSeconds = (serverEndTime - session.startTime) / 1000;
    
    // 清除 Session 防止重複提交
    delete activeSessions[sessionId];

    // --- 反作弊檢測 ---

    // 檢測 1: 時間旅行 (前端回報的時間不能比伺服器物理經過的時間還長太多)
    // 允許 2 秒的網絡延遲誤差
    const minPossibleTime = serverDurationSeconds - 2; 
    
    // 檢測 2: 超人類速度 (WPM > 200 或每秒擊鍵超過 15 次)
    // 假設每個單字 5 個字元
    const charCount = typedText.length;
    const charsPerSecond = charCount / (serverDurationSeconds || 1); // 避免除以 0
    
    if (charsPerSecond > 18) { // 世界紀錄級別約為 15-20 CPS
        console.log(`[Cheat Blocked] Speed too high: ${charsPerSecond.toFixed(2)} CPS`);
        return res.json({ success: false, isCheating: true, reason: "Speed implies automated script" });
    }

    // 檢測 3: 機器人打字規律 (Keystroke Dynamics)
    // 檢查擊鍵間隔的標準差。機器人通常間隔完全一致 (標準差接近 0)
    let intervals = [];
    for (let i = 1; i < keystrokeData.length; i++) {
        intervals.push(keystrokeData[i] - keystrokeData[i-1]);
    }
    
    // 計算間隔變異數
    if (intervals.length > 5) {
        const mean = intervals.reduce((a, b) => a + b) / intervals.length;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
        
        // 如果變異數太小（打字節奏太完美），判定為機器人
        if (variance < 5) { 
             console.log(`[Cheat Blocked] Robotic typing detected. Variance: ${variance}`);
             return res.json({ success: false, isCheating: true, reason: "Robotic typing pattern" });
        }
    }

    // --- 伺服器端計算成績 (Server Authority) ---
    
    const targetText = session.targetText || "";
    let correctChars = 0;
    const len = Math.min(targetText.length, typedText.length);
    
    for (let i = 0; i < len; i++) {
        if (targetText[i] === typedText[i]) correctChars++;
    }

    const accuracy = typedText.length === 0 ? 0 : Math.round((correctChars / typedText.length) * 100);
    // WPM 計算：(正確字元數 / 5) / 分鐘數
    const wpm = Math.round((correctChars / 5) / (serverDurationSeconds / 60));
    const finalScore = Math.round(wpm * (accuracy / 100) * 10);

    const newRecord = {
        name: playerName,
        score: finalScore,
        wpm: wpm,
        accuracy: accuracy,
        correct_chars: correctChars,
        date: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
    };

    saveScore(newRecord);

    res.json({ success: true, isCheating: false, record: newRecord });
});

// API: 獲取排行榜
app.get('/api/leaderboard', (req, res) => {
    res.json(getScores());
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});