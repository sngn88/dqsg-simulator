// 職業基本データ
const JOBS = {
    '戦士': { colors: ['y'], slots: 3, type: 'basic' },
    '武闘家': { colors: ['r'], slots: 3, type: 'basic' },
    '魔法使い': { colors: ['p'], slots: 3, type: 'basic' },
    '僧侶': { colors: ['g'], slots: 3, type: 'basic' },
    '盗賊': { colors: ['b'], slots: 3, type: 'basic' },
    'パラディン': { colors: ['g', 'y'], slots: 4, type: 'advanced' },
    '賢者': { colors: ['g', 'p'], slots: 4, type: 'advanced' },
    'レンジャー': { colors: ['r', 'b'], slots: 4, type: 'advanced' }
};

// 色コード変換マップ
const COLOR_NAME_MAP = {
    'y': '黄', 'r': '赤', 'p': '紫', 'g': '緑', 'b': '青'
};

// ローカルストレージ用キー
const STORAGE_KEY = 'simulator_settings_v1';

// アプリケーション状態管理
const state = {
    memoryData: [],
    statColumns: [],
    costBasicJobsMap: {},
    costAdvancedJobsMap: {},
    currentCostLimit: 0,
    excludedMemoryNames: new Set(),
    sortKey: null,
    sortAsc: false
};

// タブ切り替え処理
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabId === 'simTab') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        renderMemoryTables();
    }
    document.getElementById(tabId).classList.add('active');
}

// 初期化処理（データ取得・画面構築・保存データ復元）
window.addEventListener('DOMContentLoaded', () => {
    Promise.all([
        fetch('memories.txt').then(res => res.text()),
        fetch('cost_basic_jobs.txt').then(res => res.text()),
        fetch('cost_advanced_jobs.txt').then(res => res.text())
    ])
        .then(([memoriesText, basicCostText, advancedCostText]) => {
            state.costBasicJobsMap = parseCostTable(basicCostText);
            state.costAdvancedJobsMap = parseCostTable(advancedCostText);
            parseTSV(memoriesText);
            buildCustomStatInputs();
            
            loadFromLocalStorage();
            attachAutoSaveListeners();
            
            updateCostLimit();
            updateExcludeCountText();
        })
        .catch(error => {
            console.error('データ読み込みエラー:', error);
        });
});

// 設定のローカルストレージ保存
function saveToLocalStorage() {
    try {
        const userDefinedMemories = state.memoryData.filter(m => m.isUserDefined);

        const accordionState = {
            add: document.getElementById('detailsAdd')?.open,
            user: document.getElementById('detailsUser')?.open,
            exclude: document.getElementById('detailsExclude')?.open,
            manage: document.getElementById('detailsManage')?.open
        };

        const saveData = {
            job: document.getElementById('jobSelect')?.value,
            level: document.getElementById('levelInput')?.value,
            priorityStat: document.querySelector('input[name="targetStatRadio"]:checked')?.value,
            topN: document.getElementById('topNSelect')?.value,
            excludedMemories: Array.from(state.excludedMemoryNames),
            userMemories: userDefinedMemories,
            accordionState: accordionState
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
    } catch (e) {
        console.error('localStorageへの保存に失敗しました:', e);
    }
}

// 設定のローカルストレージ復元
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        const data = JSON.parse(saved);

        if (data.job && document.getElementById('jobSelect')) {
            document.getElementById('jobSelect').value = data.job;
        }
        if (data.level && document.getElementById('levelInput')) {
            document.getElementById('levelInput').value = data.level;
        }
        if (data.topN && document.getElementById('topNSelect')) {
            document.getElementById('topNSelect').value = data.topN;
        }

        if (data.priorityStat) {
            const radio = document.querySelector(`input[name="targetStatRadio"][value="${data.priorityStat}"]`);
            if (radio) {
                radio.checked = true;
                document.querySelectorAll('.chip-item').forEach(el => el.classList.remove('active'));
                radio.closest('.chip-item')?.classList.add('active');
            }
        }

        if (Array.isArray(data.excludedMemories)) {
            state.excludedMemoryNames = new Set(data.excludedMemories);
        }

        if (Array.isArray(data.userMemories) && data.userMemories.length > 0) {
            data.userMemories.forEach(userMem => {
                if (!state.memoryData.some(m => m.name === userMem.name)) {
                    state.memoryData.push(userMem);
                }
            });
        }

        if (data.accordionState) {
            const addEl = document.getElementById('detailsAdd');
            const userEl = document.getElementById('detailsUser');
            const excludeEl = document.getElementById('detailsExclude');
            const manageEl = document.getElementById('detailsManage');

            if (addEl && typeof data.accordionState.add === 'boolean') addEl.open = data.accordionState.add;
            if (userEl && typeof data.accordionState.user === 'boolean') userEl.open = data.accordionState.user;
            if (excludeEl && typeof data.accordionState.exclude === 'boolean') excludeEl.open = data.accordionState.exclude;
            if (manageEl && typeof data.accordionState.manage === 'boolean') manageEl.open = data.accordionState.manage;
        }
    } catch (e) {
        console.error('localStorageからの復元に失敗しました:', e);
    }
}

// 自動保存イベントリスナー設定
function attachAutoSaveListeners() {
    const jobSelect = document.getElementById('jobSelect');
    const levelInput = document.getElementById('levelInput');
    const topNSelect = document.getElementById('topNSelect');

    if (jobSelect) {
        jobSelect.addEventListener('change', () => {
            updateCostLimit();
            saveToLocalStorage();
        });
    }
    if (levelInput) {
        levelInput.addEventListener('input', () => {
            updateCostLimit();
            saveToLocalStorage();
        });
    }
    if (topNSelect) {
        topNSelect.addEventListener('change', saveToLocalStorage);
    }

    ['detailsAdd', 'detailsUser', 'detailsExclude', 'detailsManage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('toggle', saveToLocalStorage);
        }
    });
}

// コストデータの解析
function parseCostTable(text) {
    const costMap = {};
    const lines = text.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        if (cols.length >= 2) {
            const lv = parseInt(cols[0], 10);
            const cost = parseInt(cols[1], 10);
            if (!isNaN(lv) && !isNaN(cost)) costMap[lv] = cost;
        }
    }
    return costMap;
}

// コスト上限表示の更新
function updateCostLimit() {
    const selectedJobKey = document.getElementById('jobSelect').value;
    let lv = parseInt(document.getElementById('levelInput').value, 10);

    if (isNaN(lv) || lv < 1) lv = 1;
    if (lv > 55) lv = 55;

    const jobInfo = JOBS[selectedJobKey];
    let cost = 0;

    if (jobInfo) {
        cost = (jobInfo.type === 'basic')
            ? (state.costBasicJobsMap[lv] || 0)
            : (state.costAdvancedJobsMap[lv] || 0);
    }

    state.currentCostLimit = cost;
    document.getElementById('costLimitDisplay').textContent = `[ コスト上限: ${cost} ]`;
}

// TSVフォーマットのメモリデータ解析
function parseTSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const headers = lines[0].split('\t').map(h => h.trim());
    state.statColumns = headers.slice(3);

    const targetOrder = ['HP', '攻撃', '攻魔', '攻撃＋攻魔', '守備', '呪守', '回魔', '器用'];
    const displayStats = targetOrder.filter(s => state.statColumns.includes(s));
    state.statColumns.forEach(s => {
        if (!displayStats.includes(s)) displayStats.push(s);
    });

    const chipGrid = document.getElementById('chipGrid');
    chipGrid.innerHTML = '';

    displayStats.forEach((stat, index) => {
        const label = document.createElement('label');
        label.className = 'chip-item';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'targetStatRadio';
        radio.value = stat;

        if (index === 0) {
            radio.checked = true;
            label.classList.add('active');
        }

        radio.addEventListener('change', () => {
            document.querySelectorAll('.chip-item').forEach(el => el.classList.remove('active'));
            if (radio.checked) label.classList.add('active');
            saveToLocalStorage();
        });

        label.appendChild(radio);
        label.appendChild(document.createTextNode(stat));
        chipGrid.appendChild(label);
    });

    const colorNormalizeMap = {
        '黄': 'y', 'yellow': 'y', 'y': 'y',
        '赤': 'r', 'red': 'r', 'r': 'r',
        '紫': 'p', 'purple': 'p', 'p': 'p',
        '緑': 'g', 'green': 'g', 'g': 'g',
        '青': 'b', 'blue': 'b', 'b': 'b'
    };

    state.memoryData = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        if (cols.length < 4) continue;

        const rawColor = cols[1].toLowerCase();
        const memory = {
            originalIndex: i - 1,
            name: cols[0],
            color: colorNormalizeMap[rawColor] || rawColor,
            cost: parseInt(cols[2], 10) || 0,
            stats: {},
            isUserDefined: false
        };

        state.statColumns.forEach((stat, idx) => {
            memory.stats[stat] = parseFloat(cols[idx + 3]) || 0;
        });

        state.memoryData.push(memory);
    }
}

// ユーザー追加メモリ用入力フォームの生成
function buildCustomStatInputs() {
    const container = document.getElementById('dynamicStatInputs');
    container.innerHTML = '';

    state.statColumns.forEach(stat => {
        if (stat === '攻撃＋攻魔') return;

        const div = document.createElement('div');
        div.className = 'form-grid-item';
        div.innerHTML = `
            <label>${stat}</label>
            <input type="number" data-stat="${stat}" value="0" min="0">
        `;
        container.appendChild(div);
    });
}

// ユーザー定義メモリの追加
function addUserMemory() {
    const name = document.getElementById('addName').value.trim();
    const color = document.getElementById('addColor').value;
    const cost = parseInt(document.getElementById('addCost').value, 10) || 0;

    if (!name) {
        alert('メモリ名を入力してください。');
        return;
    }

    if (state.memoryData.some(m => m.name === name)) {
        alert('同名のメモリが既に存在します。別の名前を指定してください。');
        return;
    }

    const newMemory = {
        originalIndex: -1,
        name: name,
        color: color,
        cost: cost,
        stats: {},
        isUserDefined: true
    };

    document.querySelectorAll('#dynamicStatInputs input').forEach(input => {
        const statName = input.getAttribute('data-stat');
        newMemory.stats[statName] = parseFloat(input.value) || 0;
    });

    const atk = newMemory.stats['攻撃'] || 0;
    const matk = newMemory.stats['攻魔'] || 0;
    newMemory.stats['攻撃＋攻魔'] = atk + matk;

    state.memoryData.push(newMemory);

    document.getElementById('addName').value = '';
    document.getElementById('addCost').value = '10';
    document.querySelectorAll('#dynamicStatInputs input').forEach(input => {
        input.value = '0';
    });

    renderMemoryTables();
    saveToLocalStorage();
    alert(`メモリ「${name}」を追加しました。`);
}

// 除外件数表示の更新
function updateExcludeCountText() {
    document.getElementById('excludeCountText').textContent = `[ 除外メモリ: ${state.excludedMemoryNames.size}枚 ]`;
}

// 除外フラグの切り替え
function toggleExcludeUI(name, btnElement) {
    if (state.excludedMemoryNames.has(name)) {
        state.excludedMemoryNames.delete(name);
        if (btnElement) btnElement.classList.remove('active');
    } else {
        state.excludedMemoryNames.add(name);
        if (btnElement) btnElement.classList.add('active');
    }
    updateExcludeCountText();
    renderMemoryTables();
    saveToLocalStorage();
}

// 全除外設定のクリア
function clearAllExclusions() {
    if (state.excludedMemoryNames.size === 0) {
        alert('除外されているメモリはありません。');
        return;
    }

    if (confirm('すべての除外設定を解除しますか？')) {
        state.excludedMemoryNames.clear();
        updateExcludeCountText();
        renderMemoryTables();
        saveToLocalStorage();
    }
}

// ユーザー定義メモリの削除
function deleteUserMemory(name) {
    if (confirm(`メモリ「${name}」を削除しますか？`)) {
        state.memoryData = state.memoryData.filter(m => m.name !== name);
        state.excludedMemoryNames.delete(name);
        updateExcludeCountText();
        renderMemoryTables();
        saveToLocalStorage();
    }
}

// テーブルヘッダーのソート操作
function handleHeaderClick(key) {
    if (key === 'name') {
        state.sortKey = null;
        state.sortAsc = false;
    } else if (state.sortKey === key) {
        state.sortAsc = !state.sortAsc;
    } else {
        state.sortKey = key;
        state.sortAsc = false;
    }
    renderMemoryTables();
}

// モバイル用ソート状態管理
let manageMobileSortState = {
    selectedStat: 'cost',
    isStatAsc: true
};

// ユーザー定義メモリ一覧テーブルの描画
function renderUserMemoryTable() {
    const userMemories = state.memoryData.filter(m => m.isUserDefined);
    const container = document.getElementById('userMemoryContainer');
    document.getElementById('userMemoryCountMessage').textContent = `[ ${userMemories.length}件 ]`;

    if (userMemories.length === 0) {
        container.innerHTML = '<p class="empty-message">登録したメモリはありません。</p>';
        return;
    }

    let rowsHtml = userMemories.map(m => {
        const displayColor = COLOR_NAME_MAP[m.color] || m.color;
        let statsCellsHtml = state.statColumns.map(s => `
            <td class="num-col">${m.stats[s] || 0}</td>
        `).join('');

        return `
            <tr>
                <td>${m.name}</td>
                <td class="text-center"><span class="color-${m.color}">${displayColor}</span></td>
                <td class="num-col">${m.cost}</td>
                ${statsCellsHtml}
                <td class="text-center"><button class="btn-action" onclick="deleteUserMemory('${m.name}')">削除</button></td>
            </tr>
        `;
    }).join('');

    let headersHtml = state.statColumns.map(s => `<th>${s}</th>`).join('');

    container.innerHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>メモリ名</th>
                        <th>色</th>
                        <th>コスト</th>
                        ${headersHtml}
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// 除外メモリ一覧テーブルの描画
function renderExcludeMemoryTable() {
    const excludeMemories = state.memoryData.filter(m => state.excludedMemoryNames.has(m.name));
    const container = document.getElementById('excludeMemoryContainer');
    document.getElementById('excludeMemoryCountMessage').textContent = `[ ${excludeMemories.length}件 ]`;

    if (excludeMemories.length === 0) {
        container.innerHTML = '<p class="empty-message">除外されているメモリはありません。</p>';
        return;
    }

    let rowsHtml = excludeMemories.map(m => {
        const displayColor = COLOR_NAME_MAP[m.color] || m.color;

        return `
            <tr>
                <td>${m.name}</td>
                <td class="text-center"><span class="color-${m.color}">${displayColor}</span></td>
                <td class="num-col">${m.cost}</td>
                <td class="text-center">
                    <button class="btn-action btn-exc active" onclick="toggleExcludeUI('${m.name}', this)">除外</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div style="margin-bottom: 12px;">
            <button class="btn-secondary" onclick="clearAllExclusions()">除外設定を一括解除</button>
        </div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>メモリ名</th>
                        <th>色</th>
                        <th>コスト</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// 各種メモリ管理テーブルの再描画
function renderMemoryTables() {
    renderUserMemoryTable();
    renderExcludeMemoryTable();
    renderRegisteredMemoryTable();
}

// テーブルヘッダーのHTML生成（ソート矢印付き）
function buildTableHeaderHtml() {
    const getArrow = (key) => {
        if (state.sortKey !== key) return ' <span style="color:#adb5bd; font-size:11px;">─</span>';
        return state.sortAsc ? ' <span style="font-size:11px;">▲</span>' : ' <span style="font-size:11px;">▼</span>';
    };

    let headerHtml = `
        <th class="sortable" onclick="handleHeaderClick('name')">メモリ名${getArrow('name')}</th>
        <th class="sortable" onclick="handleHeaderClick('color')">色${getArrow('color')}</th>
        <th class="sortable" onclick="handleHeaderClick('cost')">コスト${getArrow('cost')}</th>
    `;

    state.statColumns.forEach(s => {
        headerHtml += `<th class="sortable" onclick="handleHeaderClick('${s}')">${s}${getArrow(s)}</th>`;
    });

    return headerHtml;
}

// テーブル行のHTML生成
function renderTableRowHtml(m) {
    const displayColor = COLOR_NAME_MAP[m.color] || m.color;

    let statsCellsHtml = state.statColumns.map(s => `
        <td class="num-col">${m.stats[s] || 0}</td>
    `).join('');

    return `
        <tr>
            <td>${m.name}</td>
            <td class="text-center"><span class="color-${m.color}">${displayColor}</span></td>
            <td class="num-col">${m.cost}</td>
            ${statsCellsHtml}
        </tr>
    `;
}

// 登録済み基本メモリテーブルの描画
function renderRegisteredMemoryTable() {
    const baseMemories = state.memoryData.filter(m => !m.isUserDefined);
    const countEl = document.getElementById('manageCountMessage');
    if (countEl) countEl.textContent = `[ ${baseMemories.length}件 ]`;

    const thead = document.getElementById('memoryTableHeader');
    const tbody = document.getElementById('memoryTableBody');
    if (thead && tbody) {
        thead.innerHTML = buildTableHeaderHtml();

        let pcList = [...baseMemories];
        if (state.sortKey) {
            pcList.sort((a, b) => {
                let valA, valB;
                if (state.sortKey === 'name') {
                    valA = a.name; valB = b.name;
                } else if (state.sortKey === 'color') {
                    valA = a.color; valB = b.color;
                } else if (state.sortKey === 'cost') {
                    valA = a.cost; valB = b.cost;
                } else {
                    valA = a.stats[state.sortKey] || 0; valB = b.stats[state.sortKey] || 0;
                }

                if (valA < valB) return state.sortAsc ? -1 : 1;
                if (valA > valB) return state.sortAsc ? 1 : -1;
                return 0;
            });
        } else {
            pcList.sort((a, b) => a.originalIndex - b.originalIndex);
        }
        tbody.innerHTML = pcList.map(m => renderTableRowHtml(m)).join('');
    }

    renderMobileManageTable(baseMemories);
}

// モバイル用メモリ管理表示の描画
function renderMobileManageTable(memories) {
    const mobileContainer = document.getElementById('mobileManageContainer');
    if (!mobileContainer) return;

    let mobileList = [...memories];

    mobileList.sort((a, b) => {
        const valA = manageMobileSortState.selectedStat === 'cost' ? a.cost : (a.stats[manageMobileSortState.selectedStat] || 0);
        const valB = manageMobileSortState.selectedStat === 'cost' ? b.cost : (b.stats[manageMobileSortState.selectedStat] || 0);
        return manageMobileSortState.isStatAsc ? valA - valB : valB - valA;
    });

    const statLabel = manageMobileSortState.selectedStat === 'cost' ? 'コスト' : manageMobileSortState.selectedStat;
    const arrow = manageMobileSortState.isStatAsc ? '▲' : '▼';

    let selectOptionsHtml = `<option value="cost" ${manageMobileSortState.selectedStat === 'cost' ? 'selected' : ''}>コスト</option>`;
    state.statColumns.forEach(s => {
        selectOptionsHtml += `<option value="${s}" ${manageMobileSortState.selectedStat === s ? 'selected' : ''}>${s}</option>`;
    });

    let rowsHtml = mobileList.map(m => {
        const displayColor = COLOR_NAME_MAP[m.color] || m.color;
        const val = manageMobileSortState.selectedStat === 'cost' ? m.cost : (m.stats[manageMobileSortState.selectedStat] || 0);
        return `
            <tr>
                <td>${m.name}</td>
                <td class="text-center"><span class="color-${m.color}">${displayColor}</span></td>
                <td class="num-col">${val}</td>
            </tr>
        `;
    }).join('');

    mobileContainer.innerHTML = `
        <div class="mobile-control-row" style="margin-bottom: 8px;">
            <label style="font-size:13px;">並び替え</label>
            <select onchange="handleManageMobileStatChange(this.value)">
                ${selectOptionsHtml}
            </select>
        </div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>メモリ名</th>
                        <th>色</th>
                        <th class="sortable" onclick="toggleManageMobileStatSort()">${statLabel} ${arrow}</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// モバイル用ソートステータスの変更
function handleManageMobileStatChange(val) {
    manageMobileSortState.selectedStat = val;
    renderRegisteredMemoryTable();
}

// モバイル用ソート順（昇順/降順）の切り替え
function toggleManageMobileStatSort() {
    manageMobileSortState.isStatAsc = !manageMobileSortState.isStatAsc;
    renderRegisteredMemoryTable();
}

// メモリ最適化計算の実行
function calculateOptimization() {
    const selectedJobKey = document.getElementById('jobSelect').value;
    const costLimit = state.currentCostLimit;

    const selectedRadio = document.querySelector('input[name="targetStatRadio"]:checked');
    if (!selectedRadio) return;

    const targetStat = selectedRadio.value;
    const topNLimit = parseInt(document.getElementById('topNSelect').value, 10) || 5;

    const jobInfo = JOBS[selectedJobKey];
    if (!jobInfo) return;

    const slotCount = jobInfo.slots;
    let topResults = [];

    // スロット補正（虹枠または職業一致）の適用判定
    function isBonusApplied(slotIndex, memoryColor) {
        return (slotIndex === 0) || jobInfo.colors.includes(memoryColor);
    }

    // 上位N件の結果の保持・更新
    function updateTopN(candidate) {
        topResults.push(candidate);
        topResults.sort((a, b) => b.targetValue - a.targetValue);
        if (topResults.length > topNLimit) {
            topResults.pop();
        }
    }

    const availableMemories = state.memoryData.filter(m => !state.excludedMemoryNames.has(m.name));

    const preparedMemories = availableMemories.map(m => {
        const base = m.stats[targetStat] || 0;
        return {
            ...m,
            baseStat: base,
            maxStat: Math.floor(base * 1.2)
        };
    }).filter(m => m.cost <= costLimit);

    preparedMemories.sort((a, b) => b.maxStat - a.maxStat);
    const maxSingleStat = preparedMemories.length > 0 ? preparedMemories[0].maxStat : 0;

    // 選択された組み合わせ内での最適配置（虹枠指定）の評価
    function evaluateBestArrangement(selectedMemories, totalCost) {
        let bestTargetValue = -1;
        let bestCombo = null;
        const count = selectedMemories.length;

        for (let i = 0; i < count; i++) {
            const rainbowMemory = selectedMemories[i];
            const remaining = [];
            for (let j = 0; j < count; j++) {
                if (i !== j) remaining.push(selectedMemories[j]);
            }

            remaining.sort((a, b) => {
                const aBase = a.baseStat;
                const bBase = b.baseStat;
                const aVal = isBonusApplied(1, a.color) ? a.maxStat : aBase;
                const bVal = isBonusApplied(1, b.color) ? b.maxStat : bBase;

                if (bVal !== aVal) return bVal - aVal;
                return bBase - aBase;
            });

            const currentArrangement = [rainbowMemory, ...remaining];

            let totalTargetStat = 0;
            for (let k = 0; k < count; k++) {
                const m = currentArrangement[k];
                totalTargetStat += isBonusApplied(k, m.color) ? m.maxStat : m.baseStat;
            }

            if (totalTargetStat > bestTargetValue) {
                bestTargetValue = totalTargetStat;
                bestCombo = currentArrangement;
            }
        }

        if (bestCombo) {
            updateTopN({
                combo: bestCombo,
                totalCost: totalCost,
                targetValue: bestTargetValue
            });
        }
    }

    // 組み合わせの探索（枝刈り付き再帰処理）
    function search(startIndex, currentCombo, currentCost, currentEstimatedStat) {
        if (currentCombo.length === slotCount) {
            evaluateBestArrangement(currentCombo, currentCost);
            return;
        }

        const remainingSlots = slotCount - currentCombo.length;
        if (topResults.length >= topNLimit) {
            const currentLowestTopVal = topResults[topResults.length - 1].targetValue;
            if (currentEstimatedStat + (remainingSlots * maxSingleStat) <= currentLowestTopVal) {
                return;
            }
        }

        for (let i = startIndex; i < preparedMemories.length; i++) {
            const mem = preparedMemories[i];

            if (currentCost + mem.cost > costLimit) continue;

            const isAlreadyIncluded = currentCombo.some(c => c.name === mem.name);
            if (isAlreadyIncluded) continue;

            currentCombo.push(mem);
            search(i + 1, currentCombo, currentCost + mem.cost, currentEstimatedStat + mem.maxStat);
            currentCombo.pop();
        }
    }

    search(0, [], 0, 0);

    displayResults(topResults, targetStat, jobInfo);
    saveToLocalStorage();
}

// 計算結果の画面描画（PC・モバイル対応）
function displayResults(results, targetStat, jobInfo) {
    const card = document.getElementById('resultCard');
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<p class="empty-message">条件を満たす組み合わせが見つかりませんでした。</p>';
        card.style.display = 'block';
        return;
    }

    const costLimit = state.currentCostLimit;
    const pad3 = (num) => String(num).padStart(3, ' ');

    results.forEach((res, index) => {
        const div = document.createElement('div');
        div.className = 'rank-card';

        let rowsHtml = '';
        let accordionCardsHtml = '';
        const totalStats = {};
        state.statColumns.forEach(s => totalStats[s] = 0);

        res.combo.forEach((m, slotIdx) => {
            const isRainbow = (slotIdx === 0);
            const isColorMatch = jobInfo.colors.includes(m.color);
            const isBonus = isRainbow || isColorMatch;

            const slotLabel = `${slotIdx + 1}枠目`;

            let colorLabelText = COLOR_NAME_MAP[m.color] || m.color;
            let colorLabel = `<span class="color-${m.color}">${colorLabelText}</span>`;
            if (isRainbow) {
                colorLabel += ' <strong>[虹色枠]</strong>';
            } else if (isColorMatch) {
                colorLabel += ' <strong>[色一致]</strong>';
            }

            state.statColumns.forEach(s => {
                const baseVal = m.stats[s] || 0;
                const finalVal = isBonus ? Math.floor(baseVal * 1.2) : baseVal;
                totalStats[s] += finalVal;
            });

            const baseTargetVal = m.stats[targetStat] || 0;
            const finalTargetVal = isBonus ? Math.floor(baseTargetVal * 1.2) : baseTargetVal;

            const isExcluded = state.excludedMemoryNames.has(m.name);

            const formattedFinal = pad3(finalTargetVal);
            const formattedBase = pad3(baseTargetVal);

            rowsHtml += `
                <tr>
                    <td>${slotLabel}</td>
                    <td>
                        <div class="cell-memory-fixed">
                            <span class="memory-name-text">${m.name}</span>
                            <div class="action-group">
                                <button class="btn-action btn-exc ${isExcluded ? 'active' : ''}" data-name="${m.name}" onclick="toggleExcludeUI('${m.name}', this)">除外</button>
                            </div>
                        </div>
                    </td>
                    <td>${colorLabel}</td>
                    <td class="num-col">${m.cost}</td>
                    <td class="num-col stat-num-box" style="white-space: pre;">${formattedFinal}（補正前: ${formattedBase}）</td>
                </tr>
            `;

            accordionCardsHtml += `
                <details class="mobile-memory-item">
                    <summary class="mobile-memory-summary">
                        <div class="mobile-memory-header">
                            <span class="mobile-slot-badge">${slotLabel}</span>
                            <span class="mobile-memory-name">${m.name}</span>
                            <span class="mobile-color-badge">${colorLabel}</span>
                        </div>
                        <div class="mobile-action-row" onclick="event.stopPropagation();">
                            <div class="action-group">
                                <button class="btn-action btn-exc ${isExcluded ? 'active' : ''}" data-name="${m.name}" onclick="toggleExcludeUI('${m.name}', this)">除外</button>
                            </div>
                            <span class="mobile-expand-hint">詳細 ▼</span>
                        </div>
                    </summary>
                    <div class="mobile-memory-body">
                        <div><strong>コスト:</strong> ${m.cost}</div>
                        <div><strong>${targetStat}:</strong> ${finalTargetVal}（補正前: ${baseTargetVal}）</div>
                    </div>
                </details>
            `;
        });

        let totalStatsSummary = state.statColumns.map(s => {
            return `<span class="stat-item">${s}: ${totalStats[s]}</span>`;
        }).join(' / ');

        div.innerHTML = `
            <div class="rank-title">
                [ 第 ${index + 1} 位 ] ${targetStat}合計 ${res.targetValue} <span class="sub-cost">（コスト: ${res.totalCost} / ${costLimit}）</span>
            </div>
            
            <div class="table-wrapper result-table-wrapper pc-only-result">
                <table class="result-table">
                    <thead>
                        <tr>
                            <th class="col-slot">スロット</th>
                            <th class="col-name">メモリ名</th>
                            <th class="col-color">色</th>
                            <th class="col-cost num-col">コスト</th>
                            <th class="col-target num-col">${targetStat}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>

            <div class="mobile-only-result">
                ${accordionCardsHtml}
            </div>

            <div class="total-stats">
                <span class="title-label">[ 全ステータス ]</span>
                <div class="total-stats-list">${totalStatsSummary}</div>
            </div>
        `;

        container.appendChild(div);
    });

    card.style.display = 'block';
}

// 更新履歴データ
const CHANGELOG_DATA = [
    {
        date: '2026-08-08',
        logs: [
            'v1.0.0 リリース',
            'メモリシミュレータ、メモリの登録・除外機能を実装'
        ]
    }
];

// モーダルの表示
function openModal(modalId) {
    if (modalId === 'changelogModal') {
        renderChangelog();
    }
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

// モーダルの非表示
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// モーダル外側クリック時の閉じる処理
function closeModalOnOuterClick(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
    }
}

// 更新履歴の描画
function renderChangelog() {
    const container = document.getElementById('changelogContainer');
    if (!container) return;

    let html = '';
    CHANGELOG_DATA.forEach(item => {
        const logItems = item.logs.map(log => `<li>${log}</li>`).join('');
        html += `
            <div class="changelog-item">
                <div class="changelog-date">${item.date}</div>
                <ul>${logItems}</ul>
            </div>
        `;
    });
    container.innerHTML = html;
}