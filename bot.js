const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// 1. إعداد Firebase
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// 2. إعداد البوت باستخدام التوكن الخاص بك
const bot = new Telegraf('8119083555:AAHaMuIdIS5VvQ5U_uKtdeAsiH8NQT931yI');
const MY_CHAT_ID = '7228104866';

// 3. دالة مراقبة الفواتير (Firestore Listener)
const startInvoicesListener = () => {
    console.log("🔔 جاري مراقبة الفواتير الجديدة في Fanspic...");

    // مراقبة مجموعة 'invoices' والبحث عن الفواتير التي لم يتم الإشعار بها بعد
    db.collection('invoices').where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const docId = change.doc.id;

                    console.log(`📦 تم اكتشاف طلب جديد برقم: ${docId}`);

                    const message = `⚠️ *طلب اشتراك جديد - Fanspic*\n\n` +
                        `👤 المستخدم: ${data.username || 'مجهول'}\n` +
                        `💰 المبلغ: ${data.amount} USDT\n` +
                        `📦 الباقة: ${data.package || 'غير محددة'}\n` +
                        `🆔 الفاتورة: \`${docId}\`\n\n` +
                        `⚙️ _يرجى مراجعة لوحة التحكم للتأكيد._`;

                    bot.telegram.sendMessage(MY_CHAT_ID, message, { parse_mode: 'Markdown' })
                        .then(() => {
                            // تحديث حالة الفاتورة لضمان عدم إرسالها مرة أخرى
                            return db.collection('invoices').doc(docId).update({ status: 'notified' });
                        })
                        .catch(err => console.error("❌ فشل إرسال الإشعار لتليجرام:", err));
                }
            });
        }, err => {
            console.error("❌ خطأ في الاتصال بقاعدة البيانات، إعادة المحاولة...", err);
            setTimeout(startInvoicesListener, 5000);
        });
};

// 4. تشغيل البوت
bot.start((ctx) => ctx.reply('✅ نظام Fanspic مفعل وجاهز لإرسال الفواتير.'));

bot.launch()
    .then(() => {
        console.log("🚀 بوت تليجرام يعمل الآن بنجاح!");
        startInvoicesListener();
    })
    .catch(err => console.error("❌ فشل تشغيل البوت:", err));

// معالجة الإغلاق المفاجئ
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));