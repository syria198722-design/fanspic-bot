// main.js - Consolidated & Final Logic
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

// Safe status updater
function setStatus(msg) {
    const statusEl = document.getElementById('init-status');
    if (statusEl) {
        statusEl.textContent = msg;
    }
    console.log("[App Status]:", msg);
}

let db = null;
let currentUser = null;
let selectedCelebrity = null;
let availableMethods = [];

// Main Bootloader
async function bootApp() {
    try {
        setStatus("جاري فحص المكونات... 🛠️");

        // 1. Check Firebase SDKs
        if (typeof firebase === 'undefined') {
            throw new Error("خطأ: مكتبة Firebase لم يتم تحميلها ❌");
        }

        // 2. Initialize App
        if (typeof firebaseConfig === 'undefined') {
            throw new Error("خطأ: ملف الإعدادات المفقود ❌");
        }
        
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        setStatus("تم الاتصال بـ Firebase ✅");

        // 3. Telegram Environment
        if (tg) {
            tg.expand();
            tg.ready();

            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                currentUser = tg.initDataUnsafe.user;
                document.getElementById('user-name').textContent = `مرحباً، ${currentUser.first_name} ✨`;
                setStatus("تم التعرف على المستخدم ✅");
                listenToUserBalance(currentUser.id);
                listenToClientOrders(currentUser.id);
            } else {
                setStatus("وضع المشاهدة (خارج تلجرام) ⚠️");
                document.getElementById('user-name').textContent = "زائر ✨";
            }
        } else {
            setStatus("بيئة تشغيل غير معروفة ⚠️");
            document.getElementById('user-name').textContent = "زائر ✨";
        }

        // 4. Load Content
        fetchCelebrities();
        fetchPaymentMethods();

    } catch (err) {
        console.error("Boot Error:", err);
        setStatus(err.message);
        alert(err.message);
    }
}

// --- Data Listeners ---
function listenToUserBalance(userId) {
    if(!db || !userId) return;
    db.collection('users').doc(userId.toString()).onSnapshot(doc => {
        if (doc.exists) {
            document.getElementById('balance').innerText = doc.data().balance || 0;
        } else {
            db.collection('users').doc(userId.toString()).set({
                name: currentUser.first_name,
                username: currentUser.username || '',
                balance: 0,
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }, err => console.log("Balance listener restricted"));
}

function fetchCelebrities() {
    if(!db) return;
    const grid = document.getElementById('celebrity-grid');
    setStatus("جاري تحميل قائمة المشاهير...");
    
    db.collection('celebrities').onSnapshot(snap => {
        grid.innerHTML = '';
        if (snap.empty) {
            grid.innerHTML = '<p class="empty-msg">لا توجد بيانات حالياً... 📁</p>';
            setStatus("المحل فارغ حالياً 📁");
            return;
        }

        const items = [];
        snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        items.sort((a,b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

        items.forEach(data => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="image-container"><img src="${data.image_url}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'"></div>
                <div class="card-info">
                    <h3>${data.name}</h3>
                    <span class="price-tag">${data.price_usd}$</span>
                    <button class="buy-btn" onclick="openPaymentSelector('${data.id}', '${data.name}', ${data.price_usd})">طلب المحتوى</button>
                </div>
            `;
            grid.appendChild(card);
        });
        setStatus("تفضل بالتسوق 🌟");
    }, err => setStatus("خطأ في جلب البيانات ❌"));
}

function fetchPaymentMethods() {
    if(!db) return;
    db.collection('payment_methods').onSnapshot(snap => {
        availableMethods = [];
        snap.forEach(doc => availableMethods.push({ id: doc.id, ...doc.data() }));
    });
}

// --- Modals & Actions ---
window.openPaymentSelector = (id, name, price) => {
    selectedCelebrity = { id, name, price };
    document.getElementById('item-details-text').innerText = `طلب محتوى: ${name} (${price}$)`;
    const container = document.getElementById('payment-methods-grid');
    container.innerHTML = '';
    
    availableMethods.forEach(method => {
        const div = document.createElement('div');
        div.className = 'pay-item';
        div.onclick = () => selectPayment(method);
        div.innerHTML = `<i class="fas ${method.type === 'stars' ? 'fa-star' : 'fa-wallet'}"></i><div><strong>${method.name}</strong></div>`;
        container.appendChild(div);
    });
    openModal('paymentSelectModal');
};

function selectPayment(method) {
    closeModal('paymentSelectModal');
    if (method.type === 'stars') {
        tg.showConfirm(`هل تود شراء ${selectedCelebrity.name}؟`, (ok) => {
            if(ok) tg.showAlert('ميزة النجوم قيد الربط الفني. سيتم معالجة الطلب يدوياً.');
        });
    } else {
        document.getElementById('manualPayTitle').innerText = method.name;
        document.getElementById('manualPayInstructions').innerHTML = (method.instructions || '').replace(/\n/g, '<br>');
        openModal('manualPayModal');
    }
}

window.submitManualOrder = async () => {
    if (!currentUser) return tg.showAlert('يجب الدخول من تلجرام.');
    try {
        await db.collection('orders').add({
            user_id: currentUser.id.toString(),
            user_name: currentUser.first_name,
            celebrity_id: selectedCelebrity.id,
            celebrity_name: selectedCelebrity.name,
            price: selectedCelebrity.price,
            status: 'pending',
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        tg.showAlert('تم إرسال طلبك! ✅');
        closeModal('manualPayModal');
    } catch (e) { alert("حدث خطأ"); }
};

window.rechargePoints = (amount) => {
    if (!currentUser) return tg.showAlert('يجب الدخول من تلجرام.');
    db.collection('users').doc(currentUser.id.toString()).update({
        balance: firebase.firestore.FieldValue.increment(amount)
    }).then(() => tg.showAlert('تم الشحن! 🎉'));
};

window.switchMainTab = (tab) => {
    document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tab}-view`).classList.add('active');
    if(event) event.currentTarget.classList.add('active');
};

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Init
bootApp();
