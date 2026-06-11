const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const USD_TO_BDT = 118;
const MY_BKASH = process.env.BKASH_NUMBER || "01XXXXXXXXX"; 
const MY_NAGAD = process.env.NAGAD_NUMBER || "01XXXXXXXXX";

function isAdmin(ctx) { return process.env.ADMIN_CHAT_ID && ctx.chat.id.toString() === process.env.ADMIN_CHAT_ID; }

// ==========================================
// 🔥 ADMIN CONTROL PANEL (/setup) 🔥
// ==========================================
bot.command('setup', async (ctx) => {
    if (!isAdmin(ctx)) return;

    const { data: allUsers } = await supabase.from('user_earnings').select('*');
    const { data: allStock } = await supabase.from('shop_inventory').select('is_sold');
    
    let totalUsers = allUsers ? allUsers.length : 0;
    let totalBal = 0;
    if(allUsers) allUsers.forEach(u => totalBal += (u.balance || 0));
    
    let availableStock = allStock ? allStock.filter(s => !s.is_sold).length : 0;

    const msg = `⚙️ *Admin Control Panel*\n`
              + `-------------------------------\n`
              + `1️⃣ SET1: User Statistics\n`
              + `Total Users: ${totalUsers} | Total User Balance: $${totalBal.toFixed(2)}\n`
              + `Click here to check history → /memberhistory\n`
              + `-------------------------------\n`
              + `2️⃣ SET2: Shop Inventory\n`
              + `Current Available Stock: ${availableStock} items\n`
              + `Click here to add product → /addstock\n`
              + `-------------------------------\n`
              + `3️⃣ SET3: Add User Balance\n`
              + `Click here to modify → /addbalance\n`
              + `-------------------------------`;

    ctx.replyWithMarkdown(msg);
});

// --- MEMBER HISTORY ---
bot.command('memberhistory', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('⚠️ ব্যবহারবিধি: `/memberhistory <userid>`', {parse_mode: 'Markdown'});
    
    const targetId = args[1];
    
    const { data: user } = await supabase.from('user_earnings').select('*').eq('chat_id', targetId).single();
    const { data: purchases } = await supabase.from('shop_inventory').select('*').eq('buyer_id', targetId);
    const { data: deposits } = await supabase.from('deposits').select('*').eq('chat_id', targetId);

    if (!user) return ctx.reply('❌ এই আইডির কোনো ইউজারের অস্তিত্ব নেই!');

    let pCount = purchases ? purchases.length : 0;
    let dCount = deposits ? deposits.filter(d => d.status === 'approved').length : 0;

    const msg = `👤 *Member History: ${targetId}*\n\n`
              + `💰 *Current Balance:* $${(user.balance || 0).toFixed(2)}\n`
              + `🛒 *Total Purchases:* ${pCount} items\n`
              + `🏦 *Total Approved Deposits:* ${dCount} times\n\n`
              + `_(বিস্তারিত লগ ডাটাবেসে সেভ আছে)_`;
    
    ctx.replyWithMarkdown(msg);
});

// ==========================================
// 🔥 INTERACTIVE ADD STOCK (/addstock) 🔥
// ==========================================
bot.command('addstock', async (ctx) => {
    if (!isAdmin(ctx)) return;
    await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'ADMIN_ADD_STOCK_CAT', edit_target: {} });
    
    ctx.reply('📦 *কোন ক্যাটাগরিতে প্রোডাক্ট অ্যাড করতে চান?*', Markup.inlineKeyboard([
        [Markup.button.callback('🟢 WhatsApp', 'adcat_whatsapp'), Markup.button.callback('🔵 Telegram', 'adcat_telegram')],
        [Markup.button.callback('🔐 Paid VPN', 'adcat_vpn'), Markup.button.callback('🔴 YT Premium', 'adcat_yt')]
    ]));
});

bot.action(/^adcat_(.+)$/, async (ctx) => {
    const cat = ctx.match[1];
    await supabase.from('bot_sessions').update({ step: 'ADMIN_ADD_STOCK_PRICE', edit_target: { category: cat } }).eq('chat_id', ctx.chat.id);
    ctx.editMessageText(`✅ ক্যাটাগরি: *${cat.toUpperCase()}*\n\n👉 *প্রোডাক্টটির দাম (USD) কতো হবে?* (যেমন: 1.50)`, {parse_mode: 'Markdown'});
});

// ==========================================
// 🔥 TEXT HANDLER (ADMIN & USERS) 🔥
// ==========================================
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith('/')) return;

    const { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
    if (!session) return;

    // --- ADMIN ADD STOCK LOGIC ---
    if (session.step === 'ADMIN_ADD_STOCK_PRICE' && isAdmin(ctx)) {
        const price = parseFloat(text);
        if (isNaN(price)) return ctx.reply('❌ সঠিক দাম দিন (যেমন 2.50):');
        
        session.edit_target.price = price;
        await supabase.from('bot_sessions').update({ step: 'ADMIN_ADD_STOCK_DATA', edit_target: session.edit_target }).eq('chat_id', chatId);
        ctx.reply(`✅ দাম সেট হয়েছে: $${price}\n\n👉 *এবার প্রোডাক্টের ডিটেইলস (Email:Pass, TData Link, Session String) দিন:*`);
        return;
    }

    if (session.step === 'ADMIN_ADD_STOCK_DATA' && isAdmin(ctx)) {
        const itemData = text;
        const cat = session.edit_target.category;
        const price = session.edit_target.price;

        await supabase.from('shop_inventory').insert({ category: cat, price: price, item_data: itemData });
        await supabase.from('bot_sessions').update({ step: 'MAIN_MENU', edit_target: {} }).eq('chat_id', chatId);
        
        ctx.reply(`🎉 *সাকসেস! নতুন প্রোডাক্ট স্টকে অ্যাড হয়েছে!*\n\n📦 ক্যাটাগরি: ${cat.toUpperCase()}\n💵 দাম: $${price}\n📝 ডাটা: \`${itemData}\``, {parse_mode: 'Markdown'});
        return;
    }

    // --- USER DEPOSIT TXID SUBMISSION ---
    if (session.step === 'WAITING_TXID_MANUAL') {
        const trxId = text;
        const method = session.edit_target.method;

        const { data: existTx } = await supabase.from('deposits').select('txid').eq('txid', trxId).single();
        if (existTx) return ctx.reply('❌ এই TrxID আগেই ব্যবহার করা হয়েছে!');

        await supabase.from('deposits').insert({ txid: trxId, chat_id: chatId, method: method, status: 'pending' });
        await supabase.from('bot_sessions').update({ step: 'MAIN_MENU', edit_target: {} }).eq('chat_id', chatId);

        ctx.reply('✅ *TrxID সাবমিট হয়েছে!*\nঅ্যাডমিন চেক করার সাথে সাথে আপনার ব্যালেন্স যোগ হয়ে যাবে।', { parse_mode: 'Markdown' });

        if (process.env.ADMIN_CHAT_ID) {
            const adminMsg = `🚨 *New Deposit Request*\n\n👤 *User ID:* \`${chatId}\`\n🏦 *Method:* ${method}\n📝 *TrxID:* \`${trxId}\`\n\nকত ডলার অ্যাড করতে চান সিলেক্ট করুন:`;
            bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [Markup.button.callback('Approve $1', `dapp_${trxId}_1`), Markup.button.callback('Approve $2', `dapp_${trxId}_2`)],
                        [Markup.button.callback('❌ Reject', `drej_${trxId}`)]
                    ]
                }
            }).catch(()=>{});
        }
        return;
    }
});

// ==========================================
// 🔥 MAIN MENU & DIGITAL SHOP 🔥
// ==========================================
async function sendMainMenu(ctx) {
    await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'MAIN_MENU', edit_target: {} });
    const msg = `🛒 *স্বাগতম ডিজিটাল শপে!*\n\nএখানে আপনি পাবেন প্রিমিয়াম WhatsApp, Telegram, Paid VPN এবং YT Premium অ্যাকাউন্ট ইনস্ট্যান্ট ডেলিভারিতে!`;
    return ctx.replyWithMarkdown(msg, Markup.keyboard([
        ['🛒 Digital Shop', '💳 My Account'],
        ['➕ Add Balance', '📞 Support']
    ]).resize());
}

bot.command('start', async (ctx) => {
    await supabase.from('user_earnings').upsert({ chat_id: ctx.chat.id }, { onConflict: 'chat_id', ignoreDuplicates: true });
    return sendMainMenu(ctx);
});
bot.hears('🏠 Main Menu', (ctx) => sendMainMenu(ctx));
bot.action('main_menu', (ctx) => { ctx.answerCbQuery().catch(()=>{}); sendMainMenu(ctx); });

// ==========================================
// 🔥 DIGITAL SHOP & AUTO DELIVERY 🔥
// ==========================================
bot.hears('🛒 Digital Shop', async (ctx) => {
    ctx.reply('🛍 *কোন প্রোডাক্ট কিনতে চান?*', Markup.inlineKeyboard([
        [Markup.button.callback('🟢 WhatsApp Acc', 'shop_whatsapp'), Markup.button.callback('🔵 Telegram Acc', 'shop_telegram')],
        [Markup.button.callback('🔐 Paid VPN', 'shop_vpn'), Markup.button.callback('🔴 YT Premium', 'shop_yt')]
    ]));
});

bot.action(/^shop_(.+)$/, async (ctx) => {
    const category = ctx.match[1];
    const { data: stock } = await supabase.from('shop_inventory').select('*').eq('category', category).eq('is_sold', false);
    
    if (!stock || stock.length === 0) return ctx.answerCbQuery('❌ এই মুহূর্তে স্টক শেষ! পরে চেষ্টা করুন।', { show_alert: true });

    const price = stock[0].price;
    const msg = `🛍 *Product:* ${category.toUpperCase()}\n📦 *Available Stock:* ${stock.length} টি\n💵 *Price:* $${price}\n\nকিনতে নিচের বাটনে ক্লিক করুন:`;
    
    ctx.editMessageText(msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[Markup.button.callback(`🛒 Buy Now ($${price})`, `buy_${category}_${price}`)], [Markup.button.callback('🔙 Back', 'main_menu')]] }
    });
});

bot.action(/^buy_(.+)_([\d.]+)$/, async (ctx) => {
    const category = ctx.match[1]; const price = parseFloat(ctx.match[2]);

    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', ctx.chat.id).single();
    if (!user || (user.balance || 0) < price) return ctx.answerCbQuery('❌ পর্যাপ্ত ব্যালেন্স নেই!', { show_alert: true });

    const { data: stock } = await supabase.from('shop_inventory').select('*').eq('category', category).eq('is_sold', false).limit(1);
    if (!stock || stock.length === 0) return ctx.answerCbQuery('❌ স্টক শেষ!', { show_alert: true });

    const item = stock[0];
    await supabase.from('user_earnings').update({ balance: user.balance - price }).eq('chat_id', ctx.chat.id);
    await supabase.from('shop_inventory').update({ is_sold: true, buyer_id: ctx.chat.id }).eq('id', item.id);

    ctx.editMessageText(`🎉 *পেমেন্ট সফল!*\n\n📦 *Category:* ${category.toUpperCase()}\n🔑 *Details:* \n\`${item.item_data}\`\n\n_যেকোনো সমস্যায় সাপোর্টে যোগাযোগ করুন।_`, { parse_mode: 'Markdown' });
});

// ==========================================
// 🔥 MY ACCOUNT & ADD BALANCE 🔥
// ==========================================
bot.hears('💳 My Account', async (ctx) => {
    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', ctx.chat.id).single();
    ctx.replyWithMarkdown(`👤 *আপনার অ্যাকাউন্ট*\n\n💰 *বর্তমান ব্যালেন্স:* $${(user?.balance || 0).toFixed(2)}\n🇧🇩 *টাকায় মূল্য:* ${(user?.balance * USD_TO_BDT || 0).toFixed(2)} ৳`);
});

bot.hears('➕ Add Balance', (ctx) => {
    ctx.reply('🏦 *পেমেন্ট মেথড সিলেক্ট করুন:*', Markup.inlineKeyboard([
        [Markup.button.callback('🟣 bKash', 'dep_bkash'), Markup.button.callback('🟠 Nagad', 'dep_nagad')]
    ]));
});

bot.action(/^dep_(.+)$/, async (ctx) => {
    const method = ctx.match[1];
    ctx.answerCbQuery().catch(()=>{});
    const num = method === 'bkash' ? MY_BKASH : MY_NAGAD;
    await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'WAITING_TXID_MANUAL', edit_target: { method: method.toUpperCase() } });
    const msg = `🏦 *${method.toUpperCase()} Manual Deposit*\n\n💱 *রেট:* $1 = ${USD_TO_BDT} টাকা\n👇 সেন্ড মানি করুন এই নাম্বারে:\n\`${num}\`\n\nটাকা পাঠানোর পর শুধু আপনার *TrxID* টি লিখে মেসেজ করুন:`;
    return ctx.replyWithMarkdown(msg);
});

// Admin Approve/Reject logic
bot.action(/^dapp_(.+)_([\d.]+)$/, async (ctx) => {
    const trxId = ctx.match[1]; const amount = parseFloat(ctx.match[2]);
    const { data: dep } = await supabase.from('deposits').select('*').eq('txid', trxId).single();
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery('Already processed!');
    await supabase.from('deposits').update({ status: 'approved', amount: amount }).eq('txid', trxId);
    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', dep.chat_id).single();
    await supabase.from('user_earnings').update({ balance: (user?.balance || 0) + amount }).eq('chat_id', dep.chat_id);
    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *Approved ($${amount})`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(dep.chat_id, `🎉 *পেমেন্ট ভেরিফায়েড!*\nআপনার অ্যাকাউন্টে $${amount} যোগ করা হয়েছে।`).catch(()=>{});
});

bot.action(/^drej_(.+)$/, async (ctx) => {
    const trxId = ctx.match[1];
    const { data: dep } = await supabase.from('deposits').select('*').eq('txid', trxId).single();
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery('Already processed!');
    await supabase.from('deposits').update({ status: 'rejected' }).eq('txid', trxId);
    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ *Rejected*`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(dep.chat_id, `⚠️ *পেমেন্ট রিজেক্টেড!*\nআপনার TrxID (\`${trxId}\`) ভেরিফাই করা যায়নি।`).catch(()=>{});
});

bot.hears('📞 Support', (ctx) => ctx.reply('যেকোনো সমস্যায় অ্যাডমিনের সাথে যোগাযোগ করুন: @YourAdminUsername'));

module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (e) { res.status(500).send('Error'); }
    } else res.status(200).send('Automated Shop is Running!');
};
