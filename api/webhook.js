const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const VOLTX_BASE = 'https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api';
const OTP_CHANNEL = '@fb_worker_pro_OTP'; 
const WITHDRAW_CHANNEL = '@Fb_Worker_Withdrawal';
const RATE_PER_OTP = 0.00408; 
const USD_TO_BDT = 118;
const MIN_WITHDRAW = 0.70; 

async function getVoltxHeaders() {
    return { 'mauthapi': process.env.VOLTX_API_KEY || '', 'Content-Type': 'application/json' };
}

bot.use(async (ctx, next) => {
    if (!ctx.chat) return next();
    const { data: user } = await supabase.from('user_earnings').select('is_banned').eq('chat_id', ctx.chat.id).single();
    if (user && user.is_banned) {
        if (ctx.callbackQuery) return ctx.answerCbQuery('🚫 আপনার অ্যাকাউন্টটি স্প্যামিংয়ের জন্য স্থায়ীভাবে ব্যান করা হয়েছে!', { show_alert: true });
        return ctx.reply('🚫 *অ্যাকাউন্ট ব্যানড!*\nঅতিরিক্ত ভুল তথ্য বা স্প্যাম করার কারণে আপনার অ্যাকাউন্টটি ব্যান করা হয়েছে।', {parse_mode: 'Markdown'});
    }
    return next();
});

async function handleWarning(ctx, chatId) {
    const { data: user } = await supabase.from('user_earnings').select('warnings').eq('chat_id', chatId).single();
    let warns = (user?.warnings || 0) + 1;
    if (warns >= 3) {
        await supabase.from('user_earnings').update({ warnings: warns, is_banned: true }).eq('chat_id', chatId);
        await ctx.reply('🚫 *অটো-ব্যান অ্যাক্টিভেটেড!*\nআপনি বারবার ভুল তথ্য দিয়েছেন। স্প্যামিংয়ের জন্য আপনাকে স্থায়ীভাবে ব্যান করা হলো।', {parse_mode: 'Markdown'});
        return true; 
    } else {
        await supabase.from('user_earnings').upsert({ chat_id: chatId, warnings: warns });
        await ctx.reply(`⚠️ *সতর্কতা (${warns}/3):* আপনি ভুল ইনপুট দিয়েছেন। ৩ বার ভুল করলে অ্যাকাউন্ট ব্যান হবে!`, {parse_mode: 'Markdown'});
        return false; 
    }
}

async function sendMainMenu(ctx, chatId) {
    await supabase.from('bot_sessions').upsert({
        chat_id: chatId, step: 'MAIN_MENU',
        column_names: [], permanent_settings: {},
        current_column_idx: 0, current_row_data: {}, data: [], edit_target: {}
    });

    const intro = `🌟 *স্বাগতম FB WORKER PRO বটে!* 🌟\n\n👉 *নিচের কিবোর্ড থেকে অপশন সিলেক্ট করুন:*`;
    return ctx.replyWithMarkdown(intro, Markup.keyboard([
        ['📱 Get Number (OTP)', '📝 Create Sheet'],
        ['💳 My Account']
    ]).resize());
}

bot.command('start', (ctx) => sendMainMenu(ctx, ctx.chat.id));
bot.action('main_menu', async (ctx) => { ctx.answerCbQuery().catch(()=>{}); return sendMainMenu(ctx, ctx.chat.id); });

function isAdmin(ctx) {
    return process.env.ADMIN_CHAT_ID && ctx.chat.id.toString() === process.env.ADMIN_CHAT_ID;
}

bot.command('addbalance', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('⚠️ ব্যবহারবিধি: /addbalance <User-ID> <Amount>');

    const targetUserId = args[1].trim();
    const amountToAdd = parseFloat(args[2]);

    if (isNaN(amountToAdd) || amountToAdd <= 0) return ctx.reply('❌ ভুল অ্যামাউন্ট! সঠিক পজিটিভ সংখ্যা দিন।');

    try {
        const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', targetUserId).single();
        const newBalance = (user?.balance || 0) + amountToAdd;

        await supabase.from('user_earnings').upsert({ chat_id: targetUserId, balance: newBalance });
        ctx.reply(`✅ *সাকসেস!* User \`${targetUserId}\` এর অ্যাকাউন্টে $${amountToAdd} যোগ করা হয়েছে।`, { parse_mode: 'Markdown' });
        bot.telegram.sendMessage(targetUserId, `💰 *ব্যালেন্স আপডেট!*\nঅ্যাডমিন আপনার অ্যাকাউন্টে $${amountToAdd} যোগ করেছেন।\n✨ বর্তমান ব্যালেন্স: $${newBalance.toFixed(4)}`, { parse_mode: 'Markdown' }).catch(()=>{});
    } catch (e) {
        ctx.reply(`❌ এরর হয়েছে: ${e.message}`);
    }
});

bot.command('checkchannel', async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
        await ctx.telegram.getChatAdministrators(WITHDRAW_CHANNEL);
        ctx.reply('✅ চ্যানেল কানেকশন সাকসেসফুল!');
    } catch(e) { ctx.reply('❌ চ্যানেল কানেকশন ফেইল্ড! বটকে এডমিন করেছেন কিনা চেক করুন।'); }
});

bot.command('userstatus', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const { data: allUsers } = await supabase.from('user_earnings').select('*');
    const { data: adminData } = await supabase.from('admin_stats').select('*').eq('id', 1).single();
    let totalUnpaidOtps = 0; let totalUnpaidBalance = 0;
    if(allUsers) { allUsers.forEach(u => { totalUnpaidOtps += (u.unpaid_otps || 0); totalUnpaidBalance += (u.balance || 0); }); }
    const msg = `👑 *Admin Dashboard*\n📅 *Since:* ${adminData?.last_cleared_date || 'N/A'}\n\n👥 *Users:* ${allUsers ? allUsers.length : 0}\n⏳ *Total Unpaid OTPs:* ${totalUnpaidOtps}\n💰 *Total Pending:* $${totalUnpaidBalance.toFixed(4)}`;
    ctx.replyWithMarkdown(msg);
});

bot.command('clearstatus', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const { data: allUsers } = await supabase.from('user_earnings').select('*');
    if(allUsers) {
        for(let u of allUsers) { await supabase.from('user_earnings').update({ unpaid_otps: 0, balance: 0 }).eq('chat_id', u.chat_id); }
    }
    const today = new Date().toLocaleDateString('en-GB');
    await supabase.from('admin_stats').upsert({ id: 1, last_cleared_date: today });
    ctx.reply(`✅ রিসেট সম্পন্ন হয়েছে! নতুন তারিখ: ${today}`);
});

bot.hears('💳 My Account', async (ctx) => {
    const { data: userData } = await supabase.from('user_earnings').select('*').eq('chat_id', ctx.chat.id).single();
    const balance = userData?.balance || 0;
    const msg = `👤 *My Account Balance*\n\n📊 *Total OTPs:* ${userData?.total_otps || 0}\n⏳ *Current Unpaid OTPs:* ${userData?.unpaid_otps || 0}\n💰 *Current Balance:* $${balance.toFixed(4)}\n`;
    ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([[Markup.button.callback('💸 Withdraw Funds', 'start_withdraw')]]));
});

bot.action('start_withdraw', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'WAITING_WALLET_TYPE', edit_target: {} });
    ctx.reply('🏦 *আপনার উইথড্রল মেথড সিলেক্ট করুন:*', Markup.inlineKeyboard([
        [Markup.button.callback('🟣 bKash', 'wd_bKash'), Markup.button.callback('🟠 Nagad', 'wd_Nagad')],
        [Markup.button.callback('🟣 Rocket', 'wd_Rocket'), Markup.button.callback('❌ ক্যান্সেল', 'main_menu')]
    ]));
});

bot.action(/^wd_(.+)$/, async (ctx) => {
    const walletType = ctx.match[1];
    ctx.answerCbQuery().catch(()=>{});
    await supabase.from('bot_sessions').update({ step: 'WAITING_WALLET_NUMBER', edit_target: { walletType: walletType } }).eq('chat_id', ctx.chat.id);
    ctx.reply(`আপনি *${walletType}* সিলেক্ট করেছেন।\n\n👉 *আপনার ১১-ডিজিটের ${walletType} নাম্বারটি দিন:*`, {parse_mode: 'Markdown'});
});

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith('/') || ['📱 Get Number (OTP)', '📝 Create Sheet', '💳 My Account'].includes(text)) return;

    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
    if (!session || session.step === 'MAIN_MENU') return;

    if (session.step === 'WAITING_WALLET_NUMBER') {
        if (!/^01\d{9}$/.test(text)) {
            const isBanned = await handleWarning(ctx, chatId);
            if (!isBanned) ctx.reply('❌ নাম্বারটি সঠিক নয়! নাম্বারটি অবশ্যই "01" দিয়ে শুরু হতে হবে এবং ১১ ডিজিটের হতে হবে। আবার দিন:');
            return;
        }
        session.edit_target.walletNumber = text;
        await supabase.from('bot_sessions').update({ step: 'WAITING_WITHDRAW_AMOUNT', edit_target: session.edit_target }).eq('chat_id', chatId);
        return ctx.replyWithMarkdown(`✅ নাম্বার কনফার্মড!\n\n💱 *রেট:* $1 = ${USD_TO_BDT} টাকা\n⚠️ *সর্বনিম্ন উইথড্রাল:* $${MIN_WITHDRAW}\n\n👉 *কত ডলার উইথড্র করতে চান?*`);
    }

    if (session.step === 'WAITING_WITHDRAW_AMOUNT') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
            const isBanned = await handleWarning(ctx, chatId);
            if (!isBanned) ctx.reply('❌ সঠিক সংখ্যা দিন (যেমন: 1.50):');
            return;
        }

        if (amount < MIN_WITHDRAW) {
            return ctx.reply(`❌ *উইথড্রল ব্যর্থ!*\nআপনি সর্বনিম্ন $${MIN_WITHDRAW} উইথড্র করতে পারবেন। সঠিক অ্যামাউন্ট দিন:`);
        }

        const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', chatId).single();
        if (!user || user.balance < amount) {
            const isBanned = await handleWarning(ctx, chatId);
            if (!isBanned) ctx.reply(`❌ *পর্যাপ্ত ব্যালেন্স নেই!*\nআপনার ব্যালেন্স: $${(user?.balance||0).toFixed(4)}`);
            return;
        }

        session.edit_target.withdrawAmount = amount;
        await supabase.from('bot_sessions').update({ step: 'CONFIRM_WITHDRAWAL', edit_target: session.edit_target }).eq('chat_id', chatId);

        const bdt = (amount * USD_TO_BDT).toFixed(2);
        const msg = `🧾 *উইথড্রল সামারি:*\n\n🏦 *মেথড:* ${session.edit_target.walletType}\n📱 *নাম্বার:* ${session.edit_target.walletNumber}\n💵 *অ্যামাউন্ট:* $${amount}\n🇧🇩 *পাবেন:* ${bdt} টাকা`;
        return ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm Withdrawal', 'confirm_withdraw')], [Markup.button.callback('❌ ক্যান্সেল', 'main_menu')]]));
    }
    
    // Data Entry logic...
    if (session.step === 'WAITING_FOR_COLUMNS') {
        const cols = text.split(',').map(c => c.trim()).filter(c => c.length > 0);
        await supabase.from('bot_sessions').update({ column_names: cols, step: 'ASK_PERMANENT_CHOICE' }).eq('chat_id', chatId);
        const buttons = cols.map(col => [Markup.button.callback(`📌 ${col} পার্মানেন্ট করুন`, `make_perm_${col}`)]);
        buttons.push([Markup.button.callback('⏭️ কোনোটিই নয় (ডাটা এন্ট্রি শুরু)', 'skip_permanent')]);
        return ctx.reply('✨ কলাম সেটআপ সফল!', Markup.inlineKeyboard(buttons));
    }

    if (session.step === 'DATA_ENTRY') {
        const cols = session.column_names;
        let colName = cols[session.current_column_idx];
        session.current_row_data[colName] = text;
        session.current_column_idx++;
        session = moveToNextColumn(session);

        if (session.current_column_idx >= cols.length) {
            session.data.push(session.current_row_data);
            const rowCount = session.data.length;
            session.current_row_data = {};
            session.current_column_idx = 0;
            session = moveToNextColumn(session);
            await supabase.from('bot_sessions').update({ current_column_idx: session.current_column_idx, current_row_data: session.current_row_data, data: session.data }).eq('chat_id', chatId);

            return ctx.reply(`✅ *Row ${rowCount} সেভ হয়েছে!*\n👉 *পরবর্তী Row এর জন্য [ ${cols[session.current_column_idx]} ] দিন:*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '💾 Save XLSX', callback_data: 'export_xlsx' }, { text: '🏠 মেইন মেনু', callback_data: 'main_menu' }]]}});
        }
        await supabase.from('bot_sessions').update({ current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', chatId);
        return ctx.reply(`👉 এবার দিন [ ${cols[session.current_column_idx]} ]:`);
    }
});

// 🔥 কনফার্ম উইথড্রল অ্যাকশন (Fixed Inline Keyboard Format) 🔥
bot.action('confirm_withdraw', async (ctx) => {
    ctx.answerCbQuery('Processing...').catch(()=>{});
    const { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    if (session.step !== 'CONFIRM_WITHDRAWAL') return;

    const wData = session.edit_target;
    const amount = wData.withdrawAmount;

    const { data: user } = await supabase.from('user_earnings').select('*').eq('chat_id', ctx.chat.id).single();
    if (user.balance < amount) return ctx.reply('❌ ব্যালেন্স শর্ট!');

    await supabase.from('user_earnings').update({ balance: user.balance - amount, unpaid_otps: 0 }).eq('chat_id', ctx.chat.id);
    await supabase.from('bot_sessions').update({ step: 'MAIN_MENU', edit_target: {} }).eq('chat_id', ctx.chat.id);

    const bdt = (amount * USD_TO_BDT).toFixed(2);
    // নিরাপদভাবে ইউজারের নাম নেওয়া
    const safeName = (ctx.from.first_name || 'User').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&'); 

    const channelMsg = `🚨 *New Withdrawal Request*\n\n`
                     + `👤 *User ID:* \`${ctx.chat.id}\`\n`
                     + `🗣 *Name:* ${safeName}\n`
                     + `🏦 *Wallet:* ${wData.walletType}\n`
                     + `📱 *Number:* \`${wData.walletNumber}\`\n`
                     + `💵 *Amount:* $${amount} (*${bdt} BDT*)`;

    // 🎯 ফিক্সড ইনলাইন বাটন ফরম্যাট
    await bot.telegram.sendMessage(WITHDRAW_CHANNEL, channelMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Approve', callback_data: `wapp_${ctx.chat.id}_${amount}` },
                    { text: '❌ Reject', callback_data: `wrej_${ctx.chat.id}_${amount}` }
                ]
            ]
        }
    }).catch(console.error); // এরর হলে কনসোলে দেখাবে

    ctx.reply('✅ *আপনার রিকোয়েস্ট সফলভাবে সাবমিট হয়েছে!*\nঅ্যাডমিন চেক করে টাকা পাঠিয়ে দিলে আপনি নোটিফিকেশন পেয়ে যাবেন।', {parse_mode: 'Markdown'});
});

// Channels approval handling
bot.action(/^wapp_(\d+)_([\d.]+)$/, async (ctx) => {
    const userId = ctx.match[1]; const amountUSD = ctx.match[2];
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *Status:* Approved`, { parse_mode: 'Markdown' });
    bot.telegram.sendMessage(userId, `🎉 *অভিনন্দন!*\nআপনার $${amountUSD} উইথড্রল রিকোয়েস্টটি সফলভাবে অ্যাপ্রুভ হয়েছে এবং টাকা আপনার ওয়ালেটে পাঠিয়ে দেওয়া হয়েছে।`, {parse_mode: 'Markdown'}).catch(()=>{});
});

bot.action(/^wrej_(\d+)_([\d.]+)$/, async (ctx) => {
    const userId = ctx.match[1]; const amountUSD = ctx.match[2];
    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ *Select Reason:*`, Markup.inlineKeyboard([
        [Markup.button.callback('ভুল নাম্বার', `wrzn_${userId}_${amountUSD}_InvalidNumber`)],
        [Markup.button.callback('অন্যান্য', `wrzn_${userId}_${amountUSD}_Other`)]
    ]));
});

bot.action(/^wrzn_(\d+)_([\d.]+)_([a-zA-Z]+)$/, async (ctx) => {
    const userId = ctx.match[1]; const amountUSD = parseFloat(ctx.match[2]); const rCode = ctx.match[3];
    let txt = rCode === 'InvalidNumber' ? 'আপনার দেওয়া ওয়ালেট নাম্বারটি ভুল।' : 'অ্যাডমিন কর্তৃক বাতিলকৃত।';

    const { data: user } = await supabase.from('user_earnings').select('balance').eq('chat_id', userId).single();
    if (user) await supabase.from('user_earnings').update({ balance: user.balance + amountUSD }).eq('chat_id', userId);

    await ctx.editMessageText(`❌ *Status:* Rejected (${txt})`);
    bot.telegram.sendMessage(userId, `⚠️ *উইথড্রল বাতিল!*\n$${amountUSD} ব্যালেন্স রিফান্ড করা হয়েছে।\n*কারণ:* ${txt}`).catch(()=>{});
});

// Voltxsms Number/OTP triggers
bot.hears('📱 Get Number (OTP)', async (ctx) => {
    ctx.reply('🌐 *কোন প্যানেল থেকে ফেসবুকের নাম্বার নিতে চান?*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⚡ Voltxsms Panel', callback_data: 'voltx_menu' }]] } });
});

bot.action('voltx_menu', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const res = await fetch(`${VOLTX_BASE}/liveaccess`, { headers: await getVoltxHeaders() });
        const data = await res.json();
        let fbRanges = ['23275', '447', '22501']; 
        const buttons = fbRanges.map(r => [Markup.button.callback(`🔥 ${r}XXX (Active)`, `v_get_${r}`)]);
        ctx.reply('🔥 *এক্টিভ রেঞ্জগুলো:*', Markup.inlineKeyboard(buttons));
    } catch(e) { ctx.reply('❌ API Error'); }
});

bot.action(/^v_get_(.+)$/, async (ctx) => {
    const rid = ctx.match[1];
    try {
        const res = await fetch(`${VOLTX_BASE}/getnum`, { method: 'POST', headers: await getVoltxHeaders(), body: JSON.stringify({ rid: rid }) });
        const data = await res.json();
        if (data.data && data.data.full_number) {
            const num = data.data.full_number;
            ctx.replyWithMarkdown(`✅ *নাম্বার বরাদ্দ করা হয়েছে!*\n\n📱 *Number:* \`${num}\``, Markup.inlineKeyboard([[Markup.button.callback('📩 View OTP', `v_otp_${num}`)], [Markup.button.callback('🔄 Change Number', `v_get_${rid}`)]]));
        } else ctx.reply(`❌ নাম্বার নেই।`);
    } catch(e) { ctx.reply('❌ Error'); }
});

bot.action(/^v_otp_(.+)$/, async (ctx) => {
    const fullNum = ctx.match[1]; const numToFind = fullNum.replace('+', '');
    try {
        const res = await fetch(`${VOLTX_BASE}/success-otp`, { headers: await getVoltxHeaders() });
        const data = await res.json();
        if (data?.data?.otps) {
            const foundOtp = data.data.otps.find(o => o.number.includes(numToFind));
            if (foundOtp) {
                const { data: userData } = await supabase.from('user_earnings').select('*').eq('chat_id', ctx.chat.id).single();
                let processed = userData?.processed_otps || [];
                if (!processed.includes(foundOtp.otp_id)) {
                    processed.push(foundOtp.otp_id);
                    await supabase.from('user_earnings').upsert({ chat_id: ctx.chat.id, total_otps: (userData?.total_otps||0)+1, balance: (userData?.balance||0)+RATE_PER_OTP, processed_otps: processed });
                }
                const codeMatch = foundOtp.message.match(/\d{5,8}/); const code = codeMatch ? codeMatch[0] : foundOtp.message;
                await ctx.replyWithMarkdown(`🎉 *কোড পাওয়া গেছে!*\n\n📱 *Number:* \`${fullNum}\`\n🔑 *Code:* \`${code}\``);
                const maskedNum = "******" + fullNum.slice(-4);
                await bot.telegram.sendMessage(OTP_CHANNEL, `🔥 *New Facebook Code!*\n📱 *Number:* \`${maskedNum}\`\n🔑 *Code:* \`${code}\``, { parse_mode: 'Markdown' }).catch(()=>{});
            } else ctx.reply('⏳ এখনো কোনো কোড আসেনি।');
        } else ctx.reply('⏳ কোড এখনো রিসিভ হয়নি।');
    } catch (e) { ctx.reply('❌ সার্ভার সমস্যা।'); }
});

bot.action('skip_permanent', async (ctx) => {
    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    session.step = 'DATA_ENTRY'; session.current_column_idx = 0; session.current_row_data = {};
    while (session.current_column_idx < session.column_names.length) {
        const cName = session.column_names[session.current_column_idx];
        if (session.permanent_settings[cName] !== undefined) {
            session.current_row_data[cName] = session.permanent_settings[cName];
            session.current_column_idx++;
        } else break;
    }
    await supabase.from('bot_sessions').update({ step: session.step, current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery();
    ctx.reply(`🚀 *ডাটা এন্ট্রি শুরু!*\n\n👉 প্রথম Row এর জন্য [ ${session.column_names[session.current_column_idx]} ] দিন:`, {parse_mode: 'Markdown'});
});

bot.action('export_xlsx', async (ctx) => { /* Excel logic */ ctx.reply('ফাইল তৈরি হচ্ছে...'); });

module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (e) { res.status(500).send('Error'); }
    } else res.status(200).send('Running!');
};
