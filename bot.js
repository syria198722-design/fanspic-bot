const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');

console.log("-----------------------------------------");
console.log("🚀 جاري بدء تشغيل البوت المطور V3 Pro (نسخة النجوم)...");

// 1. Firebase Initialization with Error Handling
const serviceAccount = require("./serviceAccountKey.json");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // هذا السطر يمنع أخطاء الـ Retries المزعجة
        firestore: { ignoreUndefinedProperties: true }
    });
}
const db = admin.firestore();

// 2. Bot Initialization
const bot = new Telegraf('8419083555:AAHaMuIdIS5VvQ5U_uKtdeAsiH8NQT931yI');
const ADMIN_ID = '7228104866';

// --- Celebrity Content Notification Watcher ---
db.collection('celebrities').where('notify', '==', true).onSnapshot(snap => {
    snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;

        const celeb = change.doc.data();
        const celebId = change.doc.id;
        console.log(`📺 محتوى جديد: ${celeb.name} - جاري التحضير للبث...`);

        try {
            const usersSnap = await db.collection('users').get();
            const starPrice = Math.round((celeb.price_usd || 0) * 50);
            const caption = `✨ *محتوى جديد وحصري!*\n\n👤 المشهور: *${celeb.name}*\n💰 السعر: *${celeb.price_usd} $* (${starPrice} ⭐)\n\n👾 بادر بالشراء الآن عبر المنصة!`;

            let sent = 0;
            for (const userDoc of usersSnap.docs) {
                const userId = userDoc.id;
                try {
                    await bot.telegram.sendPhoto(userId, celeb.image_url, {
                        caption: caption,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏪 فتح المتجر والاشتراك', web_app: { url: 'https://fanspic1.web.app/' } }
                            ]]
                        }
                    });
                    sent++;
                    // تأخير ذكي (100ms) لمنع الحظر (Spam Protection)
                    await new Promise(r => setTimeout(r, 100));
                } catch (e) {
                    // تجاهل المستخدمين الذين حظروا البوت صمتاً
                }
            }

            console.log(`✅ إشعار ${celeb.name}: أرسل لـ ${sent} مستخدم`);
            await db.collection('celebrities').doc(celebId).update({ notify: false });
            bot.telegram.sendMessage(ADMIN_ID, `📣 تم بث إشعار "${celeb.name}"\n✅ استلم الرسالة: ${sent} مشترك`);
        } catch (err) {
            console.error('❌ خطأ في نظام البث:', err.message);
        }
    });
}, err => console.error("❌ Firestore Watcher Error:", err.message));

// --- Stars Purchase Request Watcher ---
db.collection('stars_purchase').where('status', '==', 'pending').onSnapshot(snap => {
    snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;
        const req = change.doc.data();
        const docId = change.doc.id;

        try {
            const shortPayload = `PURCHASE|${docId}|${req.amount}|${req.celebrity_id}`;
            await bot.telegram.sendInvoice(req.user_id, {
                title: `شراء محتوى: ${req.celebrity_name}`,
                description: `المحتوى الحصري لـ ${req.celebrity_name}`,
                payload: shortPayload,
                provider_token: "",
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(req.amount) }]
            });
            await db.collection('stars_purchase').doc(docId).update({ status: 'sent' });
        } catch (err) {
            console.error("❌ خطأ فاتورة الشراء:", err.message);
            await db.collection('stars_purchase').doc(docId).update({ status: 'failed', error: err.message });
        }
    });
});

// --- Stars Recharge Request Watcher ---
db.collection('stars_recharge').where('status', '==', 'pending').onSnapshot(snap => {
    snap.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;
        const req = change.doc.data();
        const docId = change.doc.id;

        try {
            const shortPayload = `RECHARGE|${docId}|${req.amount}`;
            await bot.telegram.sendInvoice(req.user_id, {
                title: `شحن رصيد: ${req.amount} نجمة`,
                description: `إضافة نجوم لحسابك في Fanspic`,
                payload: shortPayload,
                provider_token: "",
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(req.amount) }]
            });
            await db.collection('stars_recharge').doc(docId).update({ status: 'sent' });
        } catch (err) { console.error("❌ خطأ فاتورة الشحن:", err.message); }
    });
});

// --- Payment Handlers ---
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payloadStr = ctx.message.successful_payment.invoice_payload;
        const parts = payloadStr.split('|');
        const type = parts[0];
        const amount = parseInt(parts[2]);
        const userId = ctx.from.id.toString();

        if (type === 'RECHARGE') {
            await db.collection('users').doc(userId).set({
                balance: admin.firestore.FieldValue.increment(amount)
            }, { merge: true });
            ctx.reply(`🎉 تم شحن رصيدك بـ ${amount} نجمة بنجاح!`);
        }
        else if (type === 'PURCHASE') {
            const celebId = parts[3];
            await db.collection('orders').add({
                user_id: userId,
                user_name: ctx.from.first_name,
                celebrity_id: celebId,
                amount: amount,
                status: 'approved',
                payment_method: 'Telegram Stars',
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });
            ctx.reply(`✅ مبروك! تم شراء المحتوى بنجاح. يمكنك مشاهدته الآن في المنصة.`);
            bot.telegram.sendMessage(ADMIN_ID, `💰 مبيعات جديدة!\n👤 ${ctx.from.first_name}\n💎 ${amount} نجمة`);
        }
    } catch (err) {
        console.error("❌ خطأ أثناء تأكيد الدفع:", err.message);
    }
});

// --- Launch Bot ---
bot.launch().then(() => {
    console.log("🟢 البوت V3 Pro يعمل الآن بكفاءة (Fanspic Online)");
}).catch(err => {
    if (err.message.includes("409")) {
        console.error("⚠️ تحذير: نسخة أخرى تعمل. يرجى الانتظار ثوانٍ...");
    } else {
        console.error("❌ فشل بدء البوت:", err.message);
    }
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));