const SUPABASE_URL = 'https://supabase.co';
const SUPABASE_KEY = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.',
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsZ3FybnR6Z29ybHZjcGV5dGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MDY2MzAsImV4cCI6MjExMDk4MjYzMH0.',
  '_WlajI9gcKX2PBj3n9WpZNL6HaIjRRlX3KrxvpB78fg'
].join('');

const ADMIN_USER = 'duy.ndd';
const ADMIN_PASS = 'Maianh@2001';
const GUEST_FEE = 75000;
const ANIMALS = [
  '🐶','🐱','🦊','🐼','🐧','🦩','🐳','🐰','🦁','🐯',
  '🐸','🐵','🐨','🐻','🦄','🐙','🦆','🦉','🐺'
];
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function getTuesdays() {
  const list = [], now = new Date();
  const diff = (2 - now.getDay() + 7) % 7;
  for (let i = 0; i < 4; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + diff + i * 7);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    list.push({
      key: `${yy}-${mm}-${dd}`,
      short: `T3 (${dd}/${mm})`,
      full: `Thứ Ba, ${dd}/${mm}/${yy}`
    });
  }
  return list;
}

const tuesdays = getTuesdays();
let syncStatus = 'Đang kết nối...';
let sessionAuth = JSON.parse(localStorage.getItem('dbc_auth') || 'null');
let memberTab = 'vote', adminTab = 'session', activeDayIdx = 0, statFilter = 'all';
let calMonth = new Date().getMonth(), calYear = new Date().getFullYear();
let selectedCalDate = tuesdays[0].key;
let state = {
  users: [], sessions: {}, transactions: [],
  shuttleStock: 0, stockLogs: [], qrCode: ''
};

const fmtMoney = n => (n || 0).toLocaleString('vi-VN') + 'đ';
const getUser = id => state.users.find(u => u.id === id);
const getSession = k => ({
  votes: [], guests: 0, isOpen: true, deadline: '',
  settled: false, totalCost: 0, maleFee: 0, femaleFee: 0,
  ...(state.sessions[k] || {})
});
const getLvlBadge = l => ({
  'TB+++': 'bg-rose-50 text-rose-700 border-rose-200',
  'TB+': 'bg-purple-50 text-purple-700 border-purple-200',
  'TB': 'bg-blue-50 text-blue-700 border-blue-200',
  'TB-': 'bg-amber-50 text-amber-700 border-amber-200'
}[l] || 'bg-slate-100 text-slate-600 border-slate-200');

function fmtCountdown(dl) {
  if (!dl) return '';
  const diff = new Date(dl).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRED';
  const d = Math.floor(diff / 86400000);
  const h = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  return `${d > 0 ? d + ' ngày ' : ''}${h}:${m}:${s}`;
}

setInterval(() => {
  const el = document.getElementById('liveCountdown');
  if (!el) return;
  const txt = fmtCountdown(el.getAttribute('data-deadline'));
  if (txt === 'EXPIRED') render(); else el.textContent = txt;
}, 1000);
async function initSync() {
  const { data, error } = await db.from('club_data').select('state').eq('id', 'main').single();
  if (data?.state) {
    state = { ...state, ...data.state };
    syncStatus = 'Online';
  } else if (error?.code === 'PGRST116') {
    await db.from('club_data').insert({ id: 'main', state });
    syncStatus = 'Online';
  } else {
    syncStatus = 'Lỗi kết nối';
  }
  render();
  db.channel('club_rt').on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'club_data', filter: 'id=eq.main' },
    p => { if (p.new?.state) { state = { ...state, ...p.new.state }; render(); } }
  ).subscribe();
}

async function pushState() {
  render();
  await db.from('club_data').upsert({
    id: 'main', state, updated_at: new Date().toISOString()
  });
}

const toggleAuthModal = s => document.getElementById('authModal').classList.toggle('hidden', !s);

function switchAuthTab(t) {
  document.getElementById('formLogin').classList.toggle('hidden', t !== 'login');
  document.getElementById('formRegister').classList.toggle('hidden', t !== 'register');
  document.getElementById('tabLogin').className = t === 'login'
    ? 'py-1.5 rounded-lg bg-white text-slate-900' : 'py-1.5 rounded-lg text-slate-500';
  document.getElementById('tabReg').className = t === 'register'
    ? 'py-1.5 rounded-lg bg-white text-slate-900' : 'py-1.5 rounded-lg text-slate-500';
}

function handleLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    sessionAuth = { role: 'admin' };
    localStorage.setItem('dbc_auth', JSON.stringify(sessionAuth));
    toggleAuthModal(false);
    return render();
  }
  const f = state.users.find(x =>
    (x.name.toLowerCase() === u.toLowerCase() ||
     x.nickname.toLowerCase() === u.toLowerCase()) && x.password === p
  );
  if (!f) return alert('Sai tài khoản hoặc mật khẩu!');
  sessionAuth = { role: 'member', uid: f.id };
  localStorage.setItem('dbc_auth', JSON.stringify(sessionAuth));
  toggleAuthModal(false);
  render();
}

async function handleRegister() {
  const name = document.getElementById('regName').value.trim();
  const pass = document.getElementById('regPass').value;
  if (!name || !pass) return alert('Nhập đủ Họ tên và Mật khẩu!');
  if (name.toLowerCase() === ADMIN_USER || state.users.some(x => x.name.toLowerCase() === name.toLowerCase())) {
    return alert('Tên đã tồn tại!');
  }
  const u = {
    id: Date.now(), name,
    nickname: document.getElementById('regNick').value.trim() || name,
    password: pass,
    gender: document.getElementById('regGender').value,
    level: document.getElementById('regLevel').value,
    avatar: document.getElementById('regAvatar').value,
    balance: 0, approved: false
  };
  state.users.push(u);
  sessionAuth = { role: 'member', uid: u.id };
  localStorage.setItem('dbc_auth', JSON.stringify(sessionAuth));
  toggleAuthModal(false);
  await pushState();
}

function logout() {
  sessionAuth = null;
  localStorage.removeItem('dbc_auth');
  render();
}
function renderHeader(isAdmin) {
  const pend = state.users.filter(u => !u.approved).length;
  const cur = sessionAuth?.role === 'member' ? getUser(sessionAuth.uid) : null;
  const dot = syncStatus === 'Online' ? 'bg-emerald-500' : 'bg-amber-500';
  const txt = syncStatus === 'Online' ? 'text-emerald-600' : 'text-amber-600';

  let right = '';
  if (!sessionAuth) {
    right = `<button onclick="toggleAuthModal(true)" class="bg-slate-900 text-white font-semibold px-3.5 py-1.5 rounded-xl text-xs">Đăng nhập</button>`;
  } else if (isAdmin) {
    right = `<span class="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg">👑 ${ADMIN_USER} ${pend > 0 ? `(${pend})` : ''}</span>`;
  } else {
    right = `<span class="text-xs font-semibold bg-slate-100 border px-2.5 py-1 rounded-lg">${cur?.avatar || '👤'} ${cur?.nickname || ''}</span>`;
  }

  return `
    <header class="bg-white border-b px-4 py-3 sticky top-0 z-20 flex justify-between items-center">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-lg">🐱</div>
        <div>
          <div class="flex items-center gap-1.5">
            <h1 class="font-bold text-sm">Dead badminton club</h1>
            ${isAdmin ? `<span class="bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">ADMIN</span>` : ''}
          </div>
          <span class="inline-flex items-center gap-1 text-[10px] font-medium ${txt}">
            <span class="w-1.5 h-1.5 rounded-full ${dot}"></span>${syncStatus}
          </span>
        </div>
      </div>
      <div>${right}</div>
    </header>`;
}

function render() {
  if (sessionAuth?.role === 'admin') renderAdmin();
  else renderMember();
}

function renderAdmin() {
  const pend = state.users.filter(u => !u.approved);
  const appv = state.users.filter(u => u.approved);
  let html = '';

  if (adminTab === 'session') {
    const t = tuesdays[activeDayIdx];
    const s = getSession(t.key);
    const vVotes = (s.votes || []).filter(id => getUser(id)?.approved);
    const total = vVotes.length + (s.guests || 0);

    html = `
      <div class="space-y-4">
        <div class="grid grid-cols-4 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
          ${tuesdays.map((it, i) => `
            <button onclick="activeDayIdx=${i};render()"
                    class="py-2 rounded-lg text-[11px] font-semibold ${activeDayIdx === i ? 'bg-white text-slate-900' : 'text-slate-600'}">
              ${it.short}
            </button>`).join('')}
        </div>

        <div class="bg-white p-4 rounded-2xl border space-y-3">
          <div class="flex justify-between items-center">
            <div>
              <h2 class="font-bold text-base">${t.full}</h2>
              <p class="text-xs text-slate-500">17:30 - 19:30 • <b>${total}/9</b></p>
            </div>
            <button onclick="adminToggleOpen('${t.key}')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold ${s.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
              ${s.isOpen ? '🟢 Mở vote' : '🔴 Khóa vote'}
            </button>
          </div>

          <div class="bg-slate-50 p-3 rounded-xl border space-y-2">
            <div class="flex justify-between text-xs font-bold">
              <span>⏰ Deadline vote</span>
              ${s.deadline ? `<button onclick="adminClearDl('${t.key}')" class="text-red-500">Xóa</button>` : ''}
            </div>
            <div class="flex gap-2">
              <input id="admDl" type="datetime-local" value="${s.deadline || ''}"
                     class="flex-1 px-2 py-1.5 text-xs border rounded-lg bg-white">
              <button onclick="adminSaveDl('${t.key}')"
                      class="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold">Lưu</button>
            </div>
          </div>

          <div class="flex justify-between items-center bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 text-xs">
            <span class="font-semibold text-amber-950">🏃 Vãng lai (75k):</span>
            <div class="flex items-center gap-2">
              <button onclick="adminGuest('${t.key}',-1)" class="w-7 h-7 rounded bg-white border font-bold">-1</button>
              <b class="w-4 text-center">${s.guests || 0}</b>
              <button onclick="adminGuest('${t.key}',1)" class="w-7 h-7 rounded bg-white border font-bold">+1</button>
            </div>
          </div>

          <div class="space-y-1.5">
            ${vVotes.map(id => {
              const u = getUser(id);
              return `
                <div class="flex justify-between bg-slate-50 px-3 py-2 rounded-xl border text-xs">
                  <span>${u.avatar} <b>${u.name}</b> (${u.gender})</span>
                  <button onclick="adminRmVote('${t.key}',${u.id})" class="text-red-500 font-bold">Xóa</button>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border space-y-3">
          <div class="flex justify-between">
            <h3 class="font-bold text-sm">🧮 Tính tiền (Nữ = 80% Nam)</h3>
            ${s.settled ? `<span class="text-[11px] bg-emerald-100 text-emerald-700 px-2 rounded-full font-bold">✓ Đã chốt</span>` : ''}
          </div>
          <div class="grid grid-cols-2 gap-2">
            <input id="admCourt" oninput="adminPreview('${t.key}')" type="number" placeholder="Tiền sân" class="px-3 py-2 text-xs border rounded-xl">
            <input id="admShuttle" oninput="adminPreview('${t.key}')" type="number" placeholder="Tiền cầu" class="px-3 py-2 text-xs border rounded-xl">
          </div>
          <div id="admSplitPrev" class="text-xs bg-slate-50 p-2.5 rounded-xl border">
            ${s.settled
              ? `Tổng: <b>${fmtMoney(s.totalCost)}</b> • Nam: <b>${fmtMoney(s.maleFee)}</b> • Nữ: <b>${fmtMoney(s.femaleFee)}</b>`
              : 'Nhập chi phí để xem...'}
          </div>
          <button onclick="adminSplit('${t.key}')" class="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold">
            Chốt & Trừ tiền quỹ
          </button>
        </div>
      </div>`;
  }
  else if (adminTab === 'members') {
    html = `
      <div class="space-y-4">
        ${pend.length ? `
          <div class="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2">
            <h3 class="font-bold text-xs text-amber-900">🔔 Chờ duyệt (${pend.length})</h3>
            ${pend.map(u => `
              <div class="bg-white p-2.5 rounded-xl border flex justify-between items-center text-xs">
                <span>${u.avatar} <b>${u.name}</b> (${u.gender} - ${u.level})</span>
                <div class="flex gap-1">
                  <button onclick="adminApprove(${u.id},1)" class="bg-emerald-600 text-white px-2 py-1 rounded font-semibold">Duyệt</button>
                  <button onclick="adminApprove(${u.id},0)" class="bg-red-100 text-red-600 px-2 py-1 rounded font-semibold">Xóa</button>
                </div>
              </div>`).join('')}
          </div>` : ''}

        <div class="bg-white p-4 rounded-2xl border space-y-2.5">
          <h3 class="font-bold text-sm">💳 Nạp quỹ / Cộng trừ tiền ngoài</h3>
          <select id="admTxUid" class="w-full px-3 py-2 text-xs border rounded-xl bg-white">
            ${appv.map(u => `<option value="${u.id}">${u.name} (${fmtMoney(u.balance)})</option>`).join('')}
          </select>
          <div class="grid grid-cols-2 gap-2">
            <input id="admTxAmt" type="number" placeholder="Số tiền" class="px-3 py-2 text-xs border rounded-xl">
            <select id="admTxType" class="px-2 py-2 text-xs border rounded-xl bg-white">
              <option value="dep">Nộp quỹ (+)</option>
              <option value="plus">Cộng khác (+)</option>
              <option value="minus">Trừ ngoài (-)</option>
            </select>
          </div>
          <input id="admTxNote" type="text" placeholder="Ghi chú..." class="w-full px-3 py-2 text-xs border rounded-xl">
          <button onclick="adminTx()" class="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold">Xác nhận</button>
        </div>

        <div class="bg-white p-4 rounded-2xl border space-y-2">
          <h3 class="font-bold text-sm">👥 Thành viên (${appv.length})</h3>
          ${appv.map(u => `
            <div class="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl border text-xs">
              <div>
                <b>${u.avatar} ${u.name}</b>
                <div class="text-[11px] text-slate-500">${u.gender} • ${u.level} • Pass: ${u.password}</div>
              </div>
              <button onclick="adminDel(${u.id})" class="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg font-semibold">Xóa</button>
            </div>`).join('')}
        </div>
      </div>`;
  } else if (adminTab === 'stock') {
    html = `
      <div class="space-y-4">
        <div class="bg-white p-6 rounded-2xl border text-center space-y-3">
          <div class="text-xs font-bold text-slate-400 uppercase">Tồn kho cầu</div>
          <div class="text-4xl font-extrabold">${state.shuttleStock || 0} <span class="text-base text-slate-500">ống</span></div>
          <div class="flex justify-center gap-4">
            <button onclick="adminStock(-1)" class="w-14 h-12 rounded-2xl bg-red-50 text-red-600 border font-bold text-xl">-1</button>
            <button onclick="adminStock(1)" class="w-14 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border font-bold text-xl">+1</button>
          </div>
        </div>
        <div class="bg-white p-4 rounded-2xl border space-y-1.5">
          <h3 class="font-bold text-sm">Lịch sử kho</h3>
          ${(state.stockLogs || []).map(l => `
            <div class="flex justify-between text-xs bg-slate-50 px-3 py-2 rounded-xl border">
              <span>${l.note} (${l.time})</span>
              <b class="${l.delta > 0 ? 'text-emerald-600' : 'text-red-600'}">${l.delta > 0 ? '+' : ''}${l.delta}</b>
            </div>`).join('')}
        </div>
      </div>`;
  } else {
    const tot = appv.reduce((a, u) => a + (u.balance || 0), 0);
    html = `
      <div class="space-y-4">
        <div class="bg-slate-900 text-white p-4 rounded-2xl">
          <div class="text-xs text-slate-400">Tổng quỹ toàn CLB</div>
          <div class="text-2xl font-extrabold">${fmtMoney(tot)}</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border space-y-2">
          <h3 class="font-bold text-sm">📲 Ảnh mã QR nộp quỹ</h3>
          ${state.qrCode ? `<img src="${state.qrCode}" class="w-40 h-40 object-contain mx-auto border rounded-xl">` : ''}
          <input type="file" accept="image/*" onchange="adminQR(event)" class="w-full text-xs">
        </div>
        <div class="bg-white p-4 rounded-2xl border space-y-1.5">
          <h3 class="font-bold text-sm">Quỹ từng hội viên</h3>
          ${appv.map(u => `
            <div class="flex justify-between p-2 bg-slate-50 rounded-xl border text-xs">
              <span>${u.avatar} <b>${u.name}</b></span>
              <b class="${(u.balance || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}">${fmtMoney(u.balance)}</b>
            </div>`).join('')}
        </div>
      </div>`;
  }

  document.getElementById('app').innerHTML = `
    ${renderHeader(true)}
    <main class="p-4">${html}</main>
    <nav class="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t grid grid-cols-5 py-1.5 z-30 text-[10px] font-semibold">
      <button onclick="adminTab='session';render()" class="flex flex-col items-center ${adminTab === 'session' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">🏸</span>Buổi chơi
      </button>
      <button onclick="adminTab='members';render()" class="relative flex flex-col items-center ${adminTab === 'members' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">👥</span>Thành viên
        ${pend.length ? `<span class="absolute top-0 right-3 bg-red-500 text-white px-1 rounded-full text-[9px]">${pend.length}</span>` : ''}
      </button>
      <button onclick="adminTab='stock';render()" class="flex flex-col items-center ${adminTab === 'stock' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">📦</span>Tồn kho
      </button>
      <button onclick="adminTab='fund';render()" class="flex flex-col items-center ${adminTab === 'fund' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">💰</span>Quỹ
      </button>
      <button onclick="logout()" class="flex flex-col items-center text-red-500">
        <span class="text-base">🚪</span>Đăng xuất
      </button>
    </nav>`;
}
function renderMember() {
  const cur = sessionAuth?.role === 'member' ? getUser(sessionAuth.uid) : null;
  let html = '';

  if (memberTab === 'vote') {
    const t = tuesdays[activeDayIdx];
    const s = getSession(t.key);
    const vVotes = (s.votes || []).filter(id => getUser(id)?.approved);
    const guests = s.guests || 0;
    const total = vVotes.length + guests;
    const isFull = total >= 9;
    const cd = fmtCountdown(s.deadline);
    const isExp = cd === 'EXPIRED';
    const canVote = s.isOpen && !isExp;
    const isVoted = cur && vVotes.includes(cur.id);
    const unvoted = state.users.filter(u => u.approved && !vVotes.includes(u.id));

    let btn = '';
    if (!cur) {
      btn = `<button onclick="toggleAuthModal(true)" class="w-full py-2.5 bg-slate-900 text-white font-semibold rounded-xl text-xs">Đăng nhập / Đăng ký để vote</button>`;
    } else if (!cur.approved) {
      btn = `<div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 text-center">⏳ Chờ Admin duyệt.</div>`;
    } else if (!canVote) {
      btn = `<div class="p-2.5 bg-slate-100 rounded-xl text-xs text-slate-500 text-center font-semibold">🔒 Đã khóa đăng ký.</div>`;
    } else {
      const cls = isVoted ? 'bg-slate-900 text-white' : 'bg-white text-slate-800 disabled:opacity-40';
      const txt = isVoted ? '✓ Đã báo danh (Bấm hủy)' : (isFull ? 'Hết slot (9/9)' : '🏸 Báo danh tham gia');
      btn = `<button onclick="memVote()" ${!isVoted && isFull ? 'disabled' : ''} class="w-full py-2.5 rounded-xl font-semibold text-xs border ${cls}">${txt}</button>`;
    }

    html = `
      <div class="space-y-4">
        <div class="grid grid-cols-4 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
          ${tuesdays.map((it, i) => {
            const ss = getSession(it.key);
            const c = (ss.votes || []).filter(id => getUser(id)?.approved).length + (ss.guests || 0);
            return `
              <button onclick="activeDayIdx=${i};render()"
                      class="py-2 rounded-lg text-[11px] font-semibold flex flex-col items-center ${activeDayIdx === i ? 'bg-white text-slate-900' : 'text-slate-600'}">
                <span>${it.short}</span>
                <span class="mt-0.5 px-1.5 rounded text-[10px] font-bold ${activeDayIdx === i ? 'bg-slate-900 text-white' : 'bg-slate-300'}">${c}/9</span>
              </button>`;
          }).join('')}
        </div>

        <div class="bg-white rounded-2xl p-4 border space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <h2 class="font-bold text-lg">${t.full}</h2>
              <p class="text-slate-500 text-sm">17:30 - 19:30</p>
            </div>
            <span class="px-2.5 py-1 rounded-full text-xs font-semibold border ${!canVote ? 'bg-slate-100' : isFull ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}">
              ${!canVote ? 'Đã khóa' : isFull ? 'Hết slot' : 'Đang vote'}
            </span>
          </div>

          ${s.deadline ? `
            <div class="px-3 py-2 rounded-xl border text-xs flex justify-between items-center ${isExp ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-900'}">
              <b>${isExp ? '🔒 Hết hạn vote' : '⏳ Thời gian còn lại:'}</b>
              ${!isExp ? `<span id="liveCountdown" data-deadline="${s.deadline}" class="font-mono font-extrabold text-sm">${cd}</span>` : ''}
            </div>` : ''}

          <div class="text-sm">
            Tham gia: <strong class="text-base font-extrabold">${total}/9</strong> người ${guests > 0 ? `(+${guests} vãng lai)` : ''}
          </div>
          <div class="pt-2 border-t">${btn}</div>
        </div>

        <div class="space-y-2">
          ${vVotes.map(id => {
            const u = getUser(id);
            return `
              <div class="bg-white px-3.5 py-3 rounded-xl border flex justify-between items-center">
                <div class="flex items-center gap-3">
                  <div class="text-2xl w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">${u.avatar}</div>
                  <div>
                    <div class="flex items-center gap-1.5">
                      ${u.level !== 'Ẩn trình' ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded border ${getLvlBadge(u.level)}">${u.level}</span>` : ''}
                      <b class="text-sm">${u.name}</b>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100">${u.gender}</span>
                    </div>
                    <div class="text-xs text-slate-500">(${u.nickname})</div>
                  </div>
                </div>
                <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100">🏸 Tham gia</span>
              </div>`;
          }).join('')}
          ${guests > 0 ? `
            <div class="bg-amber-50 px-3.5 py-3 rounded-xl border border-amber-200 flex justify-between items-center text-xs">
              <b>🏃 Khách vãng lai (x${guests})</b>
              <span>Phí: ${fmtMoney(GUEST_FEE)}/người</span>
            </div>` : ''}
        </div>

        <div class="bg-white p-3.5 rounded-xl border space-y-2">
          <div class="text-xs font-bold text-slate-600">Chưa vote (${unvoted.length})</div>
          <div class="flex flex-wrap gap-1.5">
            ${unvoted.map(u => `<span class="text-xs bg-slate-50 border px-2 py-1 rounded-lg">${u.avatar} ${u.name}</span>`).join('')}
          </div>
        </div>
      </div>`;
  } else if (memberTab === 'history') {
    const first = new Date(calYear, calMonth, 1).getDay();
    const days = new Date(calYear, calMonth + 1, 0).getDate();
    const sel = getSession(selectedCalDate);
    let cells = '<div></div>'.repeat(first);

    for (let d = 1; d <= days; d++) {
      const k = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const has = state.sessions[k]?.votes?.length > 0;
      const cls = selectedCalDate === k
        ? 'bg-slate-900 text-white'
        : has ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : '';
      cells += `<button onclick="selectedCalDate='${k}';render()" class="h-9 rounded-xl text-xs font-semibold ${cls}">${d}</button>`;
    }

    html = `
      <div class="space-y-4">
        <div class="bg-white p-4 rounded-2xl border space-y-3">
          <div class="flex justify-between items-center">
            <button onclick="chgMonth(-1)" class="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-bold">◀</button>
            <b class="text-sm">Tháng ${calMonth + 1}/${calYear}</b>
            <button onclick="chgMonth(1)" class="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-bold">▶</button>
          </div>
          <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
            <div>CN</div><div>T2</div><div>T3</div><div>T4</div><div>T5</div><div>T6</div><div>T7</div>
          </div>
          <div class="grid grid-cols-7 gap-1">${cells}</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border space-y-2">
          <div class="flex justify-between">
            <b class="text-sm">Ngày ${selectedCalDate}</b>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${sel.settled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
              ${sel.settled ? '✓ Đã thanh toán' : '⏳ Chưa trừ'}
            </span>
          </div>
          ${(sel.votes || []).map(id => {
            const u = getUser(id);
            if (!u) return '';
            const fee = u.gender === 'Nữ' ? sel.femaleFee : sel.maleFee;
            return `
              <div class="flex justify-between p-2 bg-slate-50 rounded-xl border text-xs">
                <span>${u.avatar} <b>${u.name}</b></span>
                <b>${sel.settled ? fmtMoney(fee) : 'Chờ chốt'}</b>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }
  else if (memberTab === 'fund') {
    if (!cur) {
      html = `<div class="bg-white p-6 rounded-2xl border text-center"><button onclick="toggleAuthModal(true)" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">Đăng nhập để xem quỹ</button></div>`;
    } else {
      const txs = (state.transactions || []).filter(t => t.uid === cur.id || t.userName === cur.name);
      const tIn = txs.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0);
      const tOut = txs.filter(t => t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);

      html = `
        <div class="space-y-4">
          <div class="bg-slate-900 text-white p-4 rounded-2xl space-y-2">
            <div class="text-xs text-slate-400">Số dư của bạn</div>
            <div class="text-2xl font-extrabold">${fmtMoney(cur.balance)}</div>
            <div class="grid grid-cols-2 pt-2 border-t border-white/10 text-xs">
              <div>Đã đóng: <b class="text-emerald-300">+${fmtMoney(tIn)}</b></div>
              <div>Đã trừ: <b class="text-rose-300">-${fmtMoney(tOut)}</b></div>
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border text-center space-y-2">
            <h3 class="font-bold text-sm">📲 Quét mã QR đóng quỹ</h3>
            ${state.qrCode ? `<img src="${state.qrCode}" class="w-48 h-48 object-contain mx-auto border rounded-xl">` : '<div class="text-xs text-slate-400 py-6 bg-slate-50 rounded-xl">Chưa có mã QR</div>'}
            <p class="text-[11px] text-slate-500">Nội dung: <b>${cur.name} nop quy</b></p>
          </div>

          <div class="bg-white p-4 rounded-2xl border space-y-1.5">
            <h3 class="font-bold text-sm">Lịch sử quỹ</h3>
            ${txs.map(t => `
              <div class="flex justify-between text-xs bg-slate-50 p-2.5 rounded-xl border">
                <span><b>${t.note}</b> (${t.time})</span>
                <b class="${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}">${t.amount >= 0 ? '+' : ''}${fmtMoney(t.amount)}</b>
              </div>`).join('')}
          </div>
        </div>`;
    }
  } else if (memberTab === 'stats') {
    const now = new Date();
    const keys = Object.keys(state.sessions || {}).filter(k => {
      const d = new Date(k);
      if (statFilter === 'session') return k === tuesdays[activeDayIdx].key;
      if (statFilter === 'week') return (now - d) <= 7 * 86400000 && d <= now;
      if (statFilter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (statFilter === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
    const rank = state.users.filter(u => u.approved)
      .map(u => ({ ...u, c: keys.reduce((a, k) => a + ((state.sessions[k]?.votes || []).includes(u.id) ? 1 : 0), 0) }))
      .sort((a, b) => b.c - a.c);

    html = `
      <div class="space-y-4">
        <div class="grid grid-cols-5 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-semibold">
          ${[['session','Buổi'],['week','Tuần'],['month','Tháng'],['year','Năm'],['all','Tất cả']].map(([k, l]) => `
            <button onclick="statFilter='${k}';render()" class="py-1.5 rounded-lg ${statFilter === k ? 'bg-white' : 'text-slate-600'}">${l}</button>`).join('')}
        </div>
        <div class="bg-white p-4 rounded-2xl border space-y-2">
          <h3 class="font-bold text-sm">📊 Chuyên cần (${keys.length} buổi)</h3>
          ${rank.map((u, i) => {
            const p = keys.length ? Math.round((u.c / keys.length) * 100) : 0;
            return `
              <div class="p-2.5 bg-slate-50 rounded-xl border text-xs space-y-1">
                <div class="flex justify-between">
                  <span><b>#${i + 1}</b> ${u.avatar} <b>${u.name}</b></span>
                  <b>${u.c}/${keys.length} (${p}%)</b>
                </div>
                <div class="w-full bg-slate-200 h-1.5 rounded-full">
                  <div class="bg-slate-900 h-full rounded-full" style="width:${p}%"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  } else {
    if (!cur) {
      html = `<div class="bg-white p-6 rounded-2xl border text-center"><button onclick="toggleAuthModal(true)" class="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">Đăng nhập</button></div>`;
    } else {
      html = `
        <div class="space-y-4">
          <div class="bg-white p-4 rounded-2xl border space-y-3">
            <div class="flex items-center gap-3 border-b pb-3">
              <div class="text-3xl w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">${cur.avatar}</div>
              <div>
                <b class="text-base">${cur.name}</b>
                <div class="text-xs text-slate-500">Số dư: <b>${fmtMoney(cur.balance)}</b></div>
              </div>
            </div>
            <div class="grid grid-cols-7 gap-1 bg-slate-50 p-2 rounded-xl border">
              ${ANIMALS.map(a => `<button onclick="selAva('${a}')" id="ava_${a}" class="ava-btn text-xl py-1 rounded-lg ${cur.avatar === a ? 'bg-slate-900' : ''}">${a}</button>`).join('')}
            </div>
            <input type="hidden" id="profAva" value="${cur.avatar}">
            <div class="grid grid-cols-2 gap-2">
              <select id="profGender" class="px-2.5 py-2 text-xs border rounded-xl bg-white">
                <option value="Nam" ${cur.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                <option value="Nữ" ${cur.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
              </select>
              <select id="profLevel" class="px-2.5 py-2 text-xs border rounded-xl bg-white">
                ${['TBY','TB-','TB','TB+','TB+++','Ẩn trình'].map(l => `<option value="${l}" ${cur.level === l ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <input id="profPass" type="password" placeholder="Đổi mật khẩu mới..." class="w-full px-3 py-2 text-xs border rounded-xl">
            <button onclick="saveProf()" class="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold">Lưu thay đổi</button>
          </div>
          <button onclick="logout()" class="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-2xl text-xs font-bold">🚪 Đăng xuất</button>
        </div>`;
    }
  }

  document.getElementById('app').innerHTML = `
    ${renderHeader(false)}
    <main class="p-4">${html}</main>
    <nav class="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t grid grid-cols-5 py-1.5 z-30 text-[10px] font-semibold">
      <button onclick="memberTab='vote';render()" class="flex flex-col items-center ${memberTab === 'vote' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">🏸</span>Vote
      </button>
      <button onclick="memberTab='history';render()" class="flex flex-col items-center ${memberTab === 'history' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">📅</span>Lịch sử
      </button>
      <button onclick="memberTab='fund';render()" class="flex flex-col items-center ${memberTab === 'fund' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">💰</span>Quỹ
      </button>
      <button onclick="memberTab='stats';render()" class="flex flex-col items-center ${memberTab === 'stats' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">📊</span>Thống kê
      </button>
      <button onclick="memberTab='profile';render()" class="flex flex-col items-center ${memberTab === 'profile' ? 'text-slate-900 font-bold' : 'text-slate-400'}">
        <span class="text-base">👤</span>Cá nhân
      </button>
    </nav>`;
}
async function memVote() {
  const k = tuesdays[activeDayIdx].key, s = getSession(k);
  if (!s.isOpen || fmtCountdown(s.deadline) === 'EXPIRED') return alert('Hết hạn vote!');
  const v = (s.votes || []).filter(id => getUser(id)?.approved);
  if (v.includes(sessionAuth.uid)) s.votes = v.filter(id => id !== sessionAuth.uid);
  else { if (v.length + (s.guests || 0) >= 9) return alert('Đủ 9 slot!'); s.votes = [...v, sessionAuth.uid]; }
  state.sessions[k] = s; await pushState();
}

function chgMonth(d) {
  calMonth += d;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  render();
}

function selAva(a) {
  document.getElementById('profAva').value = a;
  document.querySelectorAll('.ava-btn').forEach(b => b.classList.remove('bg-slate-900'));
  document.getElementById('ava_' + a).classList.add('bg-slate-900');
}

async function saveProf() {
  const u = getUser(sessionAuth.uid);
  u.avatar = document.getElementById('profAva').value;
  u.gender = document.getElementById('profGender').value;
  u.level = document.getElementById('profLevel').value;
  const p = document.getElementById('profPass').value;
  if (p) u.password = p;
  await pushState();
  alert('Đã lưu!');
}

async function adminToggleOpen(k) { const s = getSession(k); s.isOpen = !s.isOpen; state.sessions[k] = s; await pushState(); }
async function adminSaveDl(k) { const s = getSession(k); s.deadline = document.getElementById('admDl').value; state.sessions[k] = s; await pushState(); alert('Đã lưu!'); }
async function adminClearDl(k) { const s = getSession(k); s.deadline = ''; state.sessions[k] = s; await pushState(); }
async function adminGuest(k, d) {
  const s = getSession(k), c = (s.votes || []).filter(id => getUser(id)?.approved).length, n = (s.guests || 0) + d;
  if (n >= 0 && c + n <= 9) { s.guests = n; state.sessions[k] = s; await pushState(); }
}
async function adminRmVote(k, id) { const s = getSession(k); s.votes = (s.votes || []).filter(x => x !== id); state.sessions[k] = s; await pushState(); }

function adminCalc(k) {
  const s = getSession(k), pl = (s.votes || []).map(id => getUser(id)).filter(u => u?.approved), g = s.guests || 0;
  const tot = (Number(document.getElementById('admCourt').value) || 0) + (Number(document.getElementById('admShuttle').value) || 0);
  const rem = Math.max(0, tot - g * GUEST_FEE), w = pl.reduce((a, u) => a + (u.gender === 'Nữ' ? 0.8 : 1), 0);
  const m = w > 0 ? Math.round(rem / w) : 0;
  return { s, pl, g, tot, rem, m, f: Math.round(m * 0.8) };
}

function adminPreview(k) {
  const d = adminCalc(k);
  document.getElementById('admSplitPrev').innerHTML = `Tổng: <b>${fmtMoney(d.tot)}</b> - Vãng lai: <b>${fmtMoney(d.g * GUEST_FEE)}</b> = Còn: <b>${fmtMoney(d.rem)}</b><br>👉 Nam: <b>${fmtMoney(d.m)}</b> • Nữ: <b>${fmtMoney(d.f)}</b>`;
}

async function adminSplit(k) {
  const d = adminCalc(k);
  if (d.tot <= 0 || !d.pl.length) return alert('Kiểm tra lại chi phí/người chơi!');
  const now = new Date().toLocaleString('vi-VN');
  d.pl.forEach(u => {
    const fee = u.gender === 'Nữ' ? d.f : d.m;
    u.balance = (u.balance || 0) - fee;
    state.transactions.unshift({ uid: u.id, userName: u.name, amount: -fee, note: `Tiền cầu ${k}`, time: now });
  });
  Object.assign(d.s, { settled: true, totalCost: d.tot, maleFee: d.m, femaleFee: d.f });
  state.sessions[k] = d.s;
  await pushState();
  alert('Đã chốt sổ!');
}

async function adminApprove(id, ok) {
  if (ok) { const u = getUser(id); if (u) u.approved = true; }
  else state.users = state.users.filter(u => u.id !== id);
  await pushState();
}

async function adminDel(id) {
  if (confirm('Xóa thành viên này?')) { state.users = state.users.filter(u => u.id !== id); await pushState(); }
}

async function adminTx() {
  const uid = Number(document.getElementById('admTxUid').value), amt = Math.abs(Number(document.getElementById('admTxAmt').value));
  const t = document.getElementById('admTxType').value, u = getUser(uid);
  if (!u || !amt) return alert('Nhập số tiền!');
  const s = t === 'minus' ? -1 : 1, note = document.getElementById('admTxNote').value.trim() || (t === 'dep' ? 'Nộp quỹ' : 'Giao dịch khác');
  u.balance = (u.balance || 0) + s * amt;
  state.transactions.unshift({ uid: u.id, userName: u.name, amount: s * amt, note, time: new Date().toLocaleString('vi-VN') });
  await pushState();
  alert('Xong!');
}

async function adminStock(d) {
  const n = (state.shuttleStock || 0) + d;
  if (n < 0) return;
  state.shuttleStock = n;
  state.stockLogs.unshift({ delta: d, note: d > 0 ? 'Nhập cầu' : 'Xuất cầu', time: new Date().toLocaleString('vi-VN') });
  await pushState();
}

function adminQR(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async ev => { state.qrCode = ev.target.result; await pushState(); alert('Đã lưu QR!'); };
  r.readAsDataURL(f);
}

initSync();
