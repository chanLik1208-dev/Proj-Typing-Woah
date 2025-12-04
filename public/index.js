        // 全局變數
        let targetText = "";
        let timeLimitSeconds = 180;
        let timerInterval;
        let remainingTime = 0;
        let isPlaying = false;
        let currentSessionId = null; // 新增：用於驗證身分
        let keystrokes = []; // 新增：用於記錄擊鍵時間
        let lastKeyTime = 0;

        // DOM 元素引用 (保持原樣)
        const setupScreen = document.getElementById('setup-screen');
        const gameScreen = document.getElementById('game-screen');
        const resultScreen = document.getElementById('result-screen');
        const articleInput = document.getElementById('article-input');
        const timeInput = document.getElementById('time-limit');
        const nameInput = document.getElementById('student-name');
        const gameRefText = document.getElementById('game-reference-text');
        const studentInput = document.getElementById('student-input');
        const timerDisplay = document.getElementById('timer-display');
        const liveSpeedEl = document.getElementById('live-speed');
        const liveAccEl = document.getElementById('live-accuracy');
        const currentPlayerDisplay = document.getElementById('current-player-name');

        // 監聽器
        studentInput.addEventListener('input', (e) => {
            // 記錄擊鍵時間 (反作弊數據)
            const now = Date.now();
            keystrokes.push(now);

            updateRealTimeFeedback();
            // 前端只做視覺上的即時計算，不做最終定奪
            updateLiveStatsUI();
        });

        // 嚴格禁止貼上與拖放
        studentInput.addEventListener('paste', (e) => { e.preventDefault(); alert("不可以!!"); });
        studentInput.addEventListener('drop', (e) => { e.preventDefault(); alert("給我放下!!"); });

        // 1. 開始遊戲 (請求伺服器分配 Session)
        async function goToGame() {
            const playerName = nameInput.value.trim();
            targetText = articleInput.value.trim();

            if (!playerName) return alert("Please enter name!");

            try {
                // 向後端請求開始，獲取 Session ID
                const response = await fetch('/api/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetText: targetText })
                });
                const data = await response.json();
                currentSessionId = data.sessionId;

                // 初始化遊戲狀態
                timeLimitSeconds = parseInt(timeInput.value) * 60;
                remainingTime = timeLimitSeconds;
                studentInput.value = "";
                studentInput.disabled = false;
                keystrokes = []; // 重置擊鍵數據

                currentPlayerDisplay.innerText = `Player: ${playerName}`;
                showScreen('game-screen');
                updateRealTimeFeedback();

                startTimer();
                setTimeout(() => studentInput.focus(), 100);

            } catch (err) {
                alert("Server connection failed. Please check if Node.js is running.");
                console.error(err);
            }
        }

        // 2. 結束遊戲 (提交數據給伺服器驗證)
        async function finishGame() {
            clearInterval(timerInterval);
            isPlaying = false;
            studentInput.disabled = true;

            const playerName = nameInput.value.trim();
            const typedContent = studentInput.value;

            try {
                const response = await fetch('/api/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: currentSessionId,
                        playerName: playerName,
                        typedText: typedContent,
                        keystrokeData: keystrokes // 傳送擊鍵特徵供分析
                    })
                });

                const result = await response.json();

                if (result.isCheating) {
                    alert(`CHEAT DETECTED: ${result.reason}`);
                    // 顯示作弊懲罰畫面
                    document.getElementById('final-score').innerText = "CHEATER";
                    document.getElementById('final-score').style.color = "red";
                } else if (result.success) {
                    // 使用伺服器計算的權威數據
                    const rec = result.record;
                    document.getElementById('final-score').innerText = rec.score;
                    document.getElementById('res-speed').innerText = rec.wpm;
                    document.getElementById('res-accuracy').innerText = rec.accuracy + "%";
                    document.getElementById('res-count').innerText = rec.correct_chars;
                    document.getElementById('res-name').innerText = rec.name;
                }

                showScreen('result-screen');
                loadLeaderboard(); // 刷新排行榜

            } catch (err) {
                console.error("Submission failed", err);
                alert("伺服器繁忙~我正在維修:3");
            }
        }

        // 3. 載入排行榜
        async function loadLeaderboard() {
            try {
                const res = await fetch('/api/leaderboard');
                const scores = await res.json();
                renderLeaderboard(scores);
            } catch (err) {
                console.error("Failed to load leaderboard");
            }
        }

        // 渲染排行榜 (保留您原本的樣式)
        function renderLeaderboard(history) {
            const tbody = document.querySelector('#leaderboard-table tbody');
            tbody.innerHTML = "";

            history.forEach((rec, index) => {
                const rank = index + 1;
                let rankClass = rank === 1 ? "rank-1" : (rank === 2 ? "rank-2" : (rank === 3 ? "rank-3" : ""));

                // 簡單的 HTML 構造，您原本的 CSS 會自動套用
                const row = `
            <tr>
                <td class="${rankClass}">#${rank}</td>
                <td style="font-weight:bold;">${rec.name}</td>
                <td style="font-weight:bold; color:#2c3e50;">${rec.score}</td>
                <td>${rec.wpm}</td>
                <td>${rec.accuracy}%</td>
                <td style="font-size:0.8rem; color:#999;">${rec.date}</td>
            </tr>
        `;
                tbody.innerHTML += row;
            });
        }

        // 輔助功能：UI 切換
        function showScreen(id) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        function startTimer() {
            isPlaying = true;
            timerInterval = setInterval(() => {
                remainingTime--;
                updateTimerDisplay();
                if (remainingTime <= 0) finishGame();
            }, 1000);
        }

        function updateTimerDisplay() {
            const m = Math.floor(remainingTime / 60).toString().padStart(2, '0');
            const s = (remainingTime % 60).toString().padStart(2, '0');
            timerDisplay.innerText = `${m}:${s}`;
        }

        // 簡單的前端視覺反饋 (不做數據權威)
        function updateRealTimeFeedback() {
            const typed = studentInput.value;
            let html = "";
            for (let i = 0; i < targetText.length; i++) {
                const targetChar = targetText[i];
                const typedChar = typed[i];
                if (typedChar === undefined) {
                    html += (i === typed.length) ? `<span class="hl-current">${targetChar}</span>` : `<span>${targetChar}</span>`;
                } else {
                    html += (typedChar === targetChar) ? `<span class="hl-correct">${targetChar}</span>` : `<span class="hl-wrong">${targetChar}</span>`;
                }
            }
            gameRefText.innerHTML = html;

            // 自動捲動
            const currentSpan = gameRefText.querySelector('.hl-current');
            if (currentSpan) currentSpan.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        function updateLiveStatsUI() {
            // 這裡僅作視覺參考，不影響最終成績
            const typed = studentInput.value;
            const words = typed.length / 5;
            const mins = (timeLimitSeconds - remainingTime) / 60;
            const wpm = mins > 0 ? Math.round(words / mins) : 0;
            liveSpeedEl.innerText = wpm;
        }

        function resetGame() {
            nameInput.value = "";
            showScreen('setup-screen');
        }

        function refreshLeaderboard() {
            loadLeaderboard();
        }

        // 初始加載
        loadLeaderboard();