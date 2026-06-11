const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const USD_TO_BDT = 118;
const MY_BKASH = process.env.BKASH_NUMBER || "01XXXXXXXXX"; // Vercel এ বসাবেন
const MY_NAGAD = process.env.NAGAD_NUMBER || "01XXXXXXXXX";
const MY_USDT_ADDRESS = process.env.USDT_ADDRESS || "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

function isAdmin(ctx) { return process.env.ADMIN_CHAT_ID && ctx.chat.id.toString() === process.env.ADMIN_CHAT_ID; }

// ==========================================
// 🔥 MAIN MENU 🔥
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
// 🔥 ADMIN: ADD STOCK 🔥
// ==========================================
// ব্যবহারবিধি: /addstock vpn 1.50 PremiumVPN-Key-12345
bot.command('addstock', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) return ctx.reply('⚠️ ফরমেট: /addstock <ক্যাটাগরি> <দাম> <অ্যাকাউন্ট_ডিটেইলস>\nক্যাটাগরি: whatsapp, telegram, vpn, yt');
    
    const category = parts[1].toLowerCase();
    const price = parseFloat(parts[2]);
    const itemData = parts.slice(3).join(' ');

    await supabase.from('shop_inventory').insert({ category, price, item_data: itemData });
    ctx.reply(`✅ *স্টক অ্যাড হয়েছে!*\nক্যাটাগরি: ${category}\nদাম: $${price}`, {parse_mode: 'Markdown'});
});

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
    
    if (!stock || stock.length === 0) {
        return ctx.answerCbQuery('❌ এই মুহূর্তে স্টক শেষ! পরে চেষ্টা করুন।', { show_alert: true });
    }

    const price = stock[0].price; // প্রথম আইটেমের দাম
    const msg = `🛍 *Product:* ${category.toUpperCase()}\n📦 *Available Stock:* ${stock.length} টি\n💵 *Price:* $${price}\n\nকিনতে নিচের বাটনে ক্লিক করুন:`;
    
    ctx.editMessageText(msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[Markup.button.callback(`🛒 Buy Now ($${price})`, `buy_${category}_${price}`)], [Markup.button.callback('🔙 Back', 'main_menu')]] }
    });
});

bot.action(/^buy_(.+)_([\d.]+)$/, async (ctx) => {
    const category = ctx.match[1];
    const price = parseFloat(ctx.match[2]);

    // চেক ব্যালেন্স
    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', ctx.chat.id).single();
    if (!user || (user.balance || 0) < price) {
        return ctx.answerCbQuery(`❌ পর্যাপ্ত ব্যালেন্স নেই! আপনার ব্যালেন্স: $${(user?.balance || 0).toFixed(2)}`, { show_alert: true });
    }

    // স্টক থেকে ১টি আইটেম নেওয়া (is_sold = false)
    const { data: stock } = await supabase.from('shop_inventory').select('*').eq('category', category).eq('is_sold', false).limit(1);
    if (!stock || stock.length === 0) return ctx.answerCbQuery('❌ এই মুহূর্তে স্টক শেষ!', { show_alert: true });

    const item = stock[0];

    // ব্যালেন্স কাটা এবং আইটেম সোল্ড করা
    await supabase.from('user_earnings').update({ balance: user.balance - price }).eq('chat_id', ctx.chat.id);
    await supabase.from('shop_inventory').update({ is_sold: true, buyer_id: ctx.chat.id }).eq('id', item.id);

    // অটোমেটিক ডেলিভারি
    ctx.editMessageText(`🎉 *পেমেন্ট সফল! আপনার প্রোডাক্ট নিচে দেওয়া হলো:*\n\n📦 *Category:* ${category.toUpperCase()}\n🔑 *Details:* \`${item.item_data}\`\n\n_যেকোনো সমস্যায় সাপোর্টে যোগাযোগ করুন।_`, { parse_mode: 'Markdown' });
});

// ==========================================
// 🔥 MY ACCOUNT & ADD BALANCE 🔥
// ==========================================
bot.hears('💳 My Account', async (ctx) => {
    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', ctx.chat.id).single();
    ctx.replyWithMarkdown(`👤 *আপনার অ্যাকাউন্ট*\n\n💰 *বর্তমান ব্যালেন্স:* $${(user?.balance || 0).toFixed(2)}\n🇧🇩 *টাকায় মূল্য:* ${(user?.balance * USD_TO_BDT || 0).toFixed(2)} ৳`);
});

bot.hears('➕ Add Balance', (ctx) => {
    ctx.reply('🏦 *পেমেন্ট মেথড সিলেক্ট করুন:*\n_(ক্রিপ্টো পেমেন্ট ১০০% অটোমেটিক)_', Markup.inlineKeyboard([
        [Markup.button.callback('💎 USDT (TRC20) - Auto', 'dep_usdt')],
        [Markup.button.callback('🟣 bKash - Manual', 'dep_bkash'), Markup.button.callback('🟠 Nagad - Manual', 'dep_nagad')]
    ]));
});

bot.action(/^dep_(.+)$/, async (ctx) => {
    const method = ctx.match[1];
    ctx.answerCbQuery().catch(()=>{});

    if (method === 'usdt') {
        await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'WAITING_TXID_USDT' });
        const msg = `💎 *USDT (TRC20) Auto Deposit*\n\n👇 নিচের অ্যাড্রেসে ডলার পাঠান:\n\`${MY_USDT_ADDRESS}\`\n\nডলার পাঠানোর পর আপনার *Transaction Hash (TxID)* নিচে মেসেজ করে দিন। বট ৫ সেকেন্ডের মধ্যে ভেরিফাই করে ব্যালেন্স যোগ করে দেবে!`;
        return ctx.replyWithMarkdown(msg);
    } else {
        const num = method === 'bkash' ? MY_BKASH : MY_NAGAD;
        await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'WAITING_TXID_MANUAL', edit_target: { method: method.toUpperCase() } });
        const msg = `🏦 *${method.toUpperCase()} Manual Deposit*\n\n💱 *রেট:* $1 = ${USD_TO_BDT} টাকা\n👇 সেন্ড মানি করুন এই নাম্বারে:\n\`${num}\`\n\nটাকা পাঠানোর পর শুধু আপনার *TrxID* টি লিখে মেসেজ করুন:`;
        return ctx.replyWithMarkdown(msg);
    }
});

// ==========================================
// 🔥 PAYMENT VERIFICATION (AUTO & MANUAL) 🔥
// ==========================================
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (text.startsWith('/') || ['🛒 Digital Shop', '💳 My Account', '➕ Add Balance', '📞 Support', '🏠 Main Menu'].includes(text)) return;

    const { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
    if (!session || session.step === 'MAIN_MENU') return;

    // --- 💎 AUTO USDT (TRC20) VERIFICATION ---
    if (session.step === 'WAITING_TXID_USDT') {
        const txid = text;
        if (txid.length < 50) return ctx.reply('❌ এটি সঠিক TxID নয়! আবার চেক করুন।');
        
        ctx.reply('⏳ ব্লকচেইন স্ক্যান করা হচ্ছে... দয়া করে অপেক্ষা করুন।');

        // ডুপ্লিকেট চেক
        const { data: existTx } = await supabase.from('deposits').select('txid').eq('txid', txid).single();
        if (existTx) return ctx.reply('❌ এই TxID আগেই ব্যবহার করা হয়েছে!');

        try {
            // Tronscan Public API
            const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${txid}`);
            const txData = await res.json();

            if (txData.contractRet !== 'SUCCESS') return ctx.reply('❌ ট্রানজেকশনটি ফেইল হয়েছে বা ভুল নেটওয়ার্কের।');

            let validAmountUSD = 0;
            if (txData.tokenTransferInfo) {
                const transfer = txData.tokenTransferInfo;
                // চেক: অ্যাড্রেস আমার কিনা এবং টোকেন USDT কিনা
                if (transfer.to_address === MY_USDT_ADDRESS && transfer.symbol === 'USDT') {
                    validAmountUSD = parseInt(transfer.amount_str) / 1000000; // USDT has 6 decimals
                }
            }

            if (validAmountUSD > 0) {
                // ডাটাবেসে সেভ করা এবং ব্যালেন্স যোগ করা
                await supabase.from('deposits').insert({ txid: txid, chat_id: chatId, method: 'USDT', amount: validAmountUSD, status: 'approved' });
                const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', chatId).single();
                await supabase.from('user_earnings').update({ balance: (user?.balance || 0) + validAmountUSD }).eq('chat_id', chatId);
                await supabase.from('bot_sessions').update({ step: 'MAIN_MENU' }).eq('chat_id', chatId);

                return ctx.reply(`✅ *পেমেন্ট সাকসেসফুল!*\nআপনার অ্যাকাউন্টে স্বয়ংক্রিয়ভাবে $${validAmountUSD} যোগ করা হয়েছে।`, { parse_mode: 'Markdown' });
            } else {
                return ctx.reply('❌ এই ট্রানজেকশনে আমার অ্যাড্রেসে কোনো USDT আসেনি!');
            }
        } catch (e) {
            return ctx.reply('❌ সার্ভার এরর! একটু পর আবার TxID দিন।');
        }
    }

    // --- 🏦 MANUAL BKASH/NAGAD SUBMISSION ---
    if (session.step === 'WAITING_TXID_MANUAL') {
        const trxId = text;
        const method = session.edit_target.method;

        const { data: existTx } = await supabase.from('deposits').select('txid').eq('txid', trxId).single();
        if (existTx) return ctx.reply('❌ এই TrxID আগেই ব্যবহার করা হয়েছে!');

        await supabase.from('deposits').insert({ txid: trxId, chat_id: chatId, method: method, status: 'pending' });
        await supabase.from('bot_sessions').update({ step: 'MAIN_MENU', edit_target: {} }).eq('chat_id', chatId);

        ctx.reply('✅ *TrxID সাবমিট হয়েছে!*\nঅ্যাডমিন চেক করার সাথে সাথে আপনার ব্যালেন্স যোগ হয়ে যাবে।', { parse_mode: 'Markdown' });

        // অ্যাডমিনকে মেসেজ পাঠানো
        if (process.env.ADMIN_CHAT_ID) {
            const safeName = (ctx.from.first_name || 'User').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
            const adminMsg = `🚨 *New Deposit Request*\n\n👤 *User ID:* \`${chatId}\`\n🗣 *Name:* ${safeName}\n🏦 *Method:* ${method}\n📝 *TrxID:* \`${trxId}\`\n\nকত ডলার অ্যাড করতে চান তা নিচে বাটনে ক্লিক করে সিলেক্ট করুন:`;
            
            bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [Markup.button.callback('Approve $1', `dapp_${trxId}_1`), Markup.button.callback('Approve $2', `dapp_${trxId}_2`)],
                        [Markup.button.callback('Approve Custom Amount', `dappcus_${trxId}`)],
                        [Markup.button.callback('❌ Reject (Fake)', `drej_${trxId}`)]
                    ]
                }
            }).catch(()=>{});
        }
    }
});

// ==========================================
// 🔥 ADMIN DEPOSIT APPROVAL (MANUAL) 🔥
// ==========================================
bot.action(/^dapp_(.+)_([\d.]+)$/, async (ctx) => {
    const trxId = ctx.match[1]; const amount = parseFloat(ctx.match[2]);
    const { data: dep } = await supabase.from('deposits').select('*').eq('txid', trxId).single();
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery('Already processed!');

    await supabase.from('deposits').update({ status: 'approved', amount: amount }).eq('txid', trxId);
    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', dep.chat_id).single();
    await supabase.from('user_earnings').update({ balance: (user?.balance || 0) + amount }).eq('chat_id', dep.chat_id);

    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *Status:* Approved ($${amount})`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(dep.chat_id, `🎉 *পেমেন্ট ভেরিফায়েড!*\nআপনার অ্যাকাউন্টে $${amount} যোগ করা হয়েছে।`).catch(()=>{});
});

bot.action(/^drej_(.+)$/, async (ctx) => {
    const trxId = ctx.match[1];
    const { data: dep } = await supabase.from('deposits').select('*').eq('txid', trxId).single();
    if (!dep || dep.status !== 'pending') return ctx.answerCbQuery('Already processed!');

    await supabase.from('deposits').update({ status: 'rejected' }).eq('txid', trxId);
    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ *Status:* Rejected`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(dep.chat_id, `⚠️ *পেমেন্ট রিজেক্টেড!*\nআপনার TrxID (\`${trxId}\`) ভেরিফাই করা যায়নি।`).catch(()=>{});
});

module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (e) { res.status(500).send('Error'); }
    } else res.status(200).send('Automated Shop is Running!');
};
