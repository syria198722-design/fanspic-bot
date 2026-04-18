firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Safe status updater
function setStatus(msg) {
    console.log("[Admin Status]:", msg);
    // يمكننا إضافة عنصر HTML للحالة لاحقاً إذا أردنا
}

// --- Authentication ---
const ADMIN_PASSWORD = "yard_admin_2026";

function doLogin() {
    const pass = document.getElementById('adminPass').value;
    if(pass === ADMIN_PASSWORD) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        initApp();
    } else {
        document.getElementById('adminPass').value = '';
        document.getElementById('adminPass').placeholder = 'كلمة سر خاطئة! حاول مرة أخرى';
    }
}
window.doLogin = doLogin;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-screen').style.display = 'flex';
});

function initApp() {
    initTabs();
    fetchStats();
    listenToCelebrities();
    listenToPayments();
    listenToOrders();
    fetchSettings();
}

// --- Tab System ---
function initTabs() {
    const navBtns = document.querySelectorAll('.sidebar-nav .nav-btn');
    const sections = document.querySelectorAll('.tab-content');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });
}

// --- Statistics ---
async function fetchStats() {
    const usersSnap = await db.collection('users').get();
    const ordersSnap = await db.collection('orders').get();
    
    let totalRevenue = 0;
    ordersSnap.forEach(doc => {
        if(doc.data().status === 'approved') {
            totalRevenue += parseFloat(doc.data().price || 0);
        }
    });

    document.getElementById('stat-users').innerText = usersSnap.size;
    document.getElementById('stat-orders').innerText = ordersSnap.size;
    document.getElementById('stat-revenue').innerText = `${totalRevenue}$`;
}

// --- Celebrities CRUD ---
function listenToCelebrities() {
    // نستخدم الجلب العادي بدون ترتيب معقد لتجنب مشاكل الفهارس في البداية
    db.collection('celebrities').onSnapshot(snap => {
        const list = document.getElementById('celebList');
        list.innerHTML = '';
        
        const items = [];
        snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        
        // ترتيب يدوي لضمان ظهور الأحدث أولاً بدون انتظار الفهرس
        items.sort((a,b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

        items.forEach(data => {
            list.innerHTML += `
                <tr>
                    <td><img src="${data.image_url}" class="celeb-thumb"></td>
                    <td>${data.name}</td>
                    <td>${data.price_usd}$</td>
                    <td>
                        <button class="buy-btn btn-sm" onclick="editCeleb('${data.id}')">تعديل</button>
                        <button class="btn-danger btn-sm" onclick="deleteDoc('celebrities', '${data.id}')">حذف</button>
                    </td>
                </tr>
            `;
        });
    }, err => console.error("Admin Load Error:", err));
}

const saveCelebForm = document.getElementById('saveCelebForm');
saveCelebForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('celebId').value;
    const data = {
        name: document.getElementById('celebName').value,
        price_usd: parseFloat(document.getElementById('celebPrice').value),
        image_url: document.getElementById('celebImage').value,
        file_link: document.getElementById('celebFile').value,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if(!id) data.created_at = firebase.firestore.FieldValue.serverTimestamp();

    try {
        setStatus("جاري الحفظ...");
        if(id) {
            // تعديل بدون إشعار
            await db.collection('celebrities').doc(id).update(data);
        } else {
            // إضافة جديدة بعلامة الإشعار
            data.notify = true;
            await db.collection('celebrities').add(data);
        }
        closeModal('celebModal');
        saveCelebForm.reset();
        alert('تم الحفظ بنجاح! سيتم إشعار المشتركين فوراً أن كان هذا محتوى جديداً! 🎉');
    } catch(err) { 
        console.error("Save Error:", err);
        alert('خطأ في الحفظ: ' + err.message); 
    }
});

window.editCeleb = async (id) => {
    const doc = await db.collection('celebrities').doc(id).get();
    const data = doc.data();
    document.getElementById('celebId').value = id;
    document.getElementById('celebName').value = data.name;
    document.getElementById('celebPrice').value = data.price_usd;
    document.getElementById('celebImage').value = data.image_url;
    document.getElementById('celebFile').value = data.file_link;
    document.getElementById('celebModalTitle').innerText = 'تعديل مشهور';
    openModal('celebModal');
};

// --- Payment Methods CRUD ---
function listenToPayments() {
    db.collection('payment_methods').onSnapshot(snap => {
        const list = document.getElementById('paymentMethodList');
        list.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            list.innerHTML += `
                <tr>
                    <td>${data.name}</td>
                    <td>${data.type}</td>
                    <td><span class="status approved">نشط</span></td>
                    <td>
                        <button class="btn-danger btn-sm" onclick="deleteDoc('payment_methods', '${doc.id}')">حذف</button>
                    </td>
                </tr>
            `;
        });
    });
}

document.getElementById('savePaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('payName').value,
        type: document.getElementById('payType').value,
        instructions: document.getElementById('payInstructions').value,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('payment_methods').add(data);
    closeModal('paymentModal');
});

// --- Order Management ---
function listenToOrders() {
    db.collection('orders').orderBy('created_at', 'desc').onSnapshot(snap => {
        const list = document.getElementById('ordersList');
        list.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const date = data.created_at ? data.created_at.toDate().toLocaleDateString('ar-EG') : '...';
            list.innerHTML += `
                <tr>
                    <td>${data.user_name || 'عميل'}</td>
                    <td>${data.celebrity_name}</td>
                    <td>${date}</td>
                    <td><span class="status ${data.status}">${getStatusText(data.status)}</span></td>
                    <td>
                        ${data.status === 'pending' ? `
                            <button class="buy-btn btn-sm" onclick="updateOrderStatus('${doc.id}', 'approved')">قبول</button>
                            <button class="btn-danger btn-sm" onclick="openRejectModal('${doc.id}')">رفض</button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        });
    });
}

window.updateOrderStatus = async (id, status, reason = '') => {
    await db.collection('orders').doc(id).update({
        status: status,
        rejection_reason: reason,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    if(status === 'rejected') closeModal('rejectModal');
    fetchStats();
};

window.openRejectModal = (id) => {
    document.getElementById('rejectOrderId').value = id;
    openModal('rejectModal');
};

document.getElementById('rejectOrderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('rejectOrderId').value;
    const reason = document.getElementById('rejectReason').value;
    updateOrderStatus(id, 'rejected', reason);
});

// --- Helpers ---
function getStatusText(status) {
    const map = { 'pending': 'معلق', 'approved': 'مقبول', 'rejected': 'مرفوض' };
    return map[status] || status;
}

window.deleteDoc = async (coll, id) => {
    if(confirm('هل أنت متأكد من الحذف النهائي؟')) {
        try {
            await db.collection(coll).doc(id).delete();
            alert('تم الحذف بنجاح');
            console.log(`Document ${id} deleted from ${coll}`);
        } catch (err) {
            console.error("Delete Error:", err);
            alert('خطأ في الحذف: ' + err.message);
        }
    }
};

window.openModal = (id) => document.getElementById(id).classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

async function fetchSettings() {
    const doc = await db.collection('settings').doc('global').get();
    if (doc.exists) {
        const data = doc.data();
        document.getElementById('support_url').value = data.support_url || '';
        document.getElementById('invite_url').value = data.invite_url || '';
        document.getElementById('binance_wallet').value = data.binance_wallet || '';
        document.getElementById('binance_info').value = data.binance_info || '';
        document.getElementById('star_price').value = data.star_price || 50;
    }
}

document.getElementById('globalSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.collection('settings').doc('global').set({
        support_url: document.getElementById('support_url').value,
        invite_url: document.getElementById('invite_url').value,
        binance_wallet: document.getElementById('binance_wallet').value,
        binance_info: document.getElementById('binance_info').value,
        star_price: parseFloat(document.getElementById('star_price').value) || 50
    }, { merge: true });
    alert('✅ تم حفظ الإعدادات بنجاح!');
});