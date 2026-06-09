const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const VOLTX_BASE = 'https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api';
const CHANNEL_USERNAME = '@fb_worker_pro_OTP'; 
const RATE_PER_OTP = 0.00408; // ইউজারের জন্য প্রতি OTP এর দাম (2/3 অংশ)

async function getVoltxHeaders() {
    return {
        'mauthapi': process.env.VOLTX_API_KEY || '', 
        'Content-Type': 'application/json'
    };
}

// 🔥 মেইন মেনু ও কিবোর্ড 🔥
async function sendMainMenu(ctx, chatId) {
    await supabase.from('bot_sessions').upsert({
        chat_id: chatId, step: 'MAIN_MENU',
        column_names: [], permanent_settings: {},
        current_column_idx: 0, current_row_data: {}, data: [], edit_target: {}
    });

    const intro = `🌟 *স্বাগতম FB WORKER PRO বটে!* 🌟\n\n`
                + `আপনার কাজগুলো দ্রুত ও নির্ভুল করতে আমি প্রস্তুত।\n\n`
                + `👉 *নিচের কিবোর্ড থেকে অপশন সিলেক্ট করুন:*`;
    
    // নিচের কিবোর্ডে Sheet, OTP এবং My Account সাজানো হলো
    return ctx.replyWithMarkdown(intro, Markup.keyboard([
        ['📱 Get Number (OTP)', '📝 Create Sheet'],
        ['💳 My Account']
    ]).resize());
}

bot.command('start', (ctx) => sendMainMenu(ctx, ctx.chat.id));
bot.action('main_menu', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    return sendMainMenu(ctx, ctx.chat.id);
});

// ==========================================
// 🔥 ADMIN COMMANDS (হিডেন ফিচার) 🔥
// ==========================================
function isAdmin(ctx) {
    return process.env.ADMIN_CHAT_ID && ctx.chat.id.toString() === process.env.ADMIN_CHAT_ID;
}

// চ্যানেল চেক করার কমান্ড
bot.command('checkchannel', async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
        const chatAdmins = await ctx.telegram.getChatAdministrators(CHANNEL_USERNAME);
        const botInfo = await bot.telegram.getMe();
        const isBotAdmin = chatAdmins.some(admin => admin.user.id === botInfo.id);
        
        if(isBotAdmin) {
             ctx.reply('✅ *চ্যানেল স্ট্যাটাস:* পারফেক্ট! বট সফলভাবে চ্যানেলের সাথে কানেক্টেড এবং অ্যাডমিন হিসেবে আছে।', {parse_mode: 'Markdown'});
        } else {
             ctx.reply('⚠️ *চ্যানেল স্ট্যাটাস:* চ্যানেল পাওয়া গেছে, কিন্তু বটকে অ্যাডমিন করা হয়নি।', {parse_mode: 'Markdown'});
        }
    } catch(e) {
        ctx.reply('❌ *চ্যানেল স্ট্যাটাস:* চ্যানেল পাওয়া যায়নি। হয়তো ইউজারনেম ভুল অথবা বটকে চ্যানেলে অ্যাড করা হয়নি।', {parse_mode: 'Markdown'});
    }
});

// অ্যাডমিন ড্যাশবোর্ড (ইউজারদের ব্যালেন্স ও রিপোর্ট)
bot.command('userstatus', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const { data: allUsers } = await supabase.from('user_earnings').select('*');
    const { data: adminData } = await supabase.from('admin_stats').select('*').eq('id', 1).single();

    let totalUsers = allUsers ? allUsers.length : 0;
    let totalUnpaidOtps = 0;
    let totalUnpaidBalance = 0;

    if(allUsers) {
        allUsers.forEach(u => {
            totalUnpaidOtps += (u.unpaid_otps || 0);
            totalUnpaidBalance += (u.balance || 0);
        });
    }

    const startDate = adminData?.last_cleared_date || 'N/A';

    const msg = `👑 *Admin Dashboard*\n`
              + `📅 *Current Period:* Since ${startDate}\n\n`
              + `👥 *Total Active Users:* ${totalUsers}\n`
              + `⏳ *Total Unpaid OTPs (All Users):* ${totalUnpaidOtps}\n`
              + `💰 *Total Pending Payout:* $${totalUnpaidBalance.toFixed(4)}\n\n`
              + `_⚠️ পেমেন্ট ক্লিয়ার করে সবার ব্যালেন্স 0 করতে টাইপ করুন: /clearstatus_`;
    ctx.replyWithMarkdown(msg);
});

// পেমেন্ট ক্লিয়ার করার কমান্ড
bot.command('clearstatus', async (ctx) => {
    if (!isAdmin(ctx)) return;
    
    const { data: allUsers } = await supabase.from('user_earnings').select('*');
    if(allUsers) {
        for(let u of allUsers) {
            await supabase.from('user_earnings').update({ unpaid_otps: 0, balance: 0 }).eq('chat_id', u.chat_id);
        }
    }
    
    const today = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    await supabase.from('admin_stats').upsert({ id: 1, last_cleared_date: today });

    ctx.reply(`✅ *সাকসেস!* সব ইউজারের Unpaid OTP এবং ব্যালেন্স ক্লিয়ার করে দেওয়া হয়েছে।\n📅 নতুন হিসাব শুরু হলো: ${today} থেকে।`, {parse_mode: 'Markdown'});
});

// ==========================================
// 🔥 MY ACCOUNT & WITHDRAW 🔥
// ==========================================
bot.hears('💳 My Account', async (ctx) => {
    // ইউজারের ডাটাবেস চেক করা, না থাকলে তৈরি করা
    const { data: userData } = await supabase.from('user_earnings').select('*').eq('chat_id', ctx.chat.id).single();
    
    const total = userData?.total_otps || 0;
    const unpaid = userData?.unpaid_otps || 0;
    const balance = userData?.balance || 0;

    const msg = `👤 *My Account Balance*\n\n`
              + `📊 *Total OTPs Fetched:* ${total} (লাইফটাইম)\n`
              + `⏳ *Current Unpaid OTPs:* ${unpaid}\n`
              + `💰 *Current Balance:* $${balance.toFixed(4)}\n`;

    ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('💸 Withdraw Funds', 'withdraw_soon')]
    ]));
});

bot.action('withdraw_soon', ctx => ctx.answerCbQuery('⚠️ উইথড্রল সিস্টেম খুব শীঘ্রই চালু হবে (Coming Soon)!', { show_alert: true }));

// ==========================================
// 🔥 VOLTXSMS API & OTP LOGIC 🔥
// ==========================================
bot.hears('📱 Get Number (OTP)', async (ctx) => {
    ctx.reply('🌐 *কোন প্যানেল থেকে ফেসবুকের নাম্বার নিতে চান?*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⚡ Voltxsms Panel', callback_data: 'voltx_menu' }]] }
    });
});

bot.action('voltx_menu', async (ctx) => {
    ctx.answerCbQuery('লাইভ রেঞ্জ খোঁজা হচ্ছে...').catch(()=>{});
    try {
        const res = await fetch(`${VOLTX_BASE}/liveaccess`, { headers: await getVoltxHeaders() });
        const data = await res.json();
        
        let fbRanges = [];
        if(data?.data?.services) {
            const fbService = data.data.services.find(s => s.sid.toLowerCase().includes('facebook'));
            if(fbService && fbService.ranges) fbRanges = fbService.ranges.map(r => r.replace(/X/g, ''));
        }
        if(fbRanges.length === 0) fbRanges = ['23275', '447', '22501']; 

        const buttons = fbRanges.map(r => [Markup.button.callback(`🔥 ${r}XXX (Active)`, `v_get_${r}`)]);
        ctx.reply('🔥 *ফেসবুকের জন্য বর্তমানে সবচেয়ে এক্টিভ রেঞ্জগুলো:*', Markup.inlineKeyboard(buttons));
    } catch(e) {
        ctx.reply('❌ Voltxsms সার্ভারের সাথে কানেক্ট করা যাচ্ছে না। API Key চেক করুন।');
    }
});

bot.action(/^v_get_(.+)$/, async (ctx) => {
    const rid = ctx.match[1];
    ctx.answerCbQuery('নাম্বার জেনারেট হচ্ছে...').catch(()=>{});
    try {
        const res = await fetch(`${VOLTX_BASE}/getnum`, {
            method: 'POST',
            headers: await getVoltxHeaders(),
            body: JSON.stringify({ rid: rid })
        });
        const data = await res.json();

        if (data.meta && data.meta.code === 200 && data.data && data.data.full_number) {
            const num = data.data.full_number;
            const msg = `✅ *নতুন ফেসবুক নাম্বার বরাদ্দ করা হয়েছে!*\n\n`
                      + `📱 *Number:* \`${num}\`\n`
                      + `🌍 *Country:* ${data.data.country || 'Unknown'}\n\n`
                      + `💡 _(নাম্বারের ওপর ট্যাপ করলেই কপি হয়ে যাবে)_`;

            ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
                [Markup.button.callback('📩 View OTP (কোড দেখুন)', `v_otp_${num}`)],
                [Markup.button.callback('🔄 Change Number (বদলান)', `v_get_${rid}`)],
                [Markup.button.url('🌐 OTP Channel', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)]
            ]));
        } else {
            ctx.reply(`❌ এই রেঞ্জে আপাতত নাম্বার নেই: ${data?.meta?.status || 'Out of stock'}`);
        }
    } catch(e) {
        ctx.reply('❌ এপিআই এরর! আবার চেষ্টা করুন।');
    }
});

bot.action(/^v_otp_(.+)$/, async (ctx) => {
    const fullNum = ctx.match[1];
    const numToFind = fullNum.replace('+', '');
    ctx.answerCbQuery('OTP চেক করা হচ্ছে...').catch(()=>{});

    try {
        const res = await fetch(`${VOLTX_BASE}/success-otp`, { headers: await getVoltxHeaders() });
        const data = await res.json();

        if (data?.data?.otps) {
            const foundOtp = data.data.otps.find(o => o.number.includes(numToFind) || numToFind.includes(o.number));

            if (foundOtp) {
                // ১. ডুপ্লিকেট ব্যালেন্স প্রোটেকশন
                const { data: userData } = await supabase.from('user_earnings').select('*').eq('chat_id', ctx.chat.id).single();
                let processed = userData?.processed_otps || [];
                
                // যদি এই ওটিপি আইডি আগে কাউন্ট না হয়ে থাকে, তবেই টাকা অ্যাড হবে
                if (!processed.includes(foundOtp.otp_id)) {
                    processed.push(foundOtp.otp_id);
                    const newTotal = (userData?.total_otps || 0) + 1;
                    const newUnpaid = (userData?.unpaid_otps || 0) + 1;
                    const newBalance = (userData?.balance || 0) + RATE_PER_OTP;

                    await supabase.from('user_earnings').upsert({
                        chat_id: ctx.chat.id,
                        total_otps: newTotal,
                        unpaid_otps: newUnpaid,
                        balance: newBalance,
                        processed_otps: processed
                    });
                }

                // ২. মেসেজ প্রসেসিং
                const codeMatch = foundOtp.message.match(/\d{5,8}/);
                const code = codeMatch ? codeMatch[0] : foundOtp.message;

                const userMsg = `🎉 *ফেসবুক কোড সফলভাবে পাওয়া গেছে!*\n\n`
                              + `📱 *Number:* \`${fullNum}\`\n`
                              + `✉️ *Full SMS:* ${foundOtp.message}\n`
                              + `🔑 *Code:* \`${code}\`\n\n`
                              + `💡 _আপনার ব্যালেন্সে $${RATE_PER_OTP} যোগ করা হয়েছে!_`;
                await ctx.replyWithMarkdown(userMsg);

                // ৩. চ্যানেলে মেসেজ পাঠানো (হাইড করে)
                const maskedNum = "******" + fullNum.slice(-4);
                const channelMsg = `🔥 *New Facebook Code Received!*\n\n`
                                 + `📱 *Number:* \`${maskedNum}\`\n`
                                 + `🔑 *Code:* \`${code}\`\n\n`
                                 + `🤖 _Powered by Pro Bot_`;
                await bot.telegram.sendMessage(CHANNEL_USERNAME, channelMsg, { parse_mode: 'Markdown' }).catch(()=>{});

            } else {
                ctx.reply('⏳ এখনো কোনো কোড আসেনি। একটু পর আবার "View OTP" বাটনে চাপ দিন।');
            }
        } else {
            ctx.reply('⏳ কোড এখনো রিসিভ হয়নি।');
        }
    } catch (e) {
        ctx.reply('❌ OTP সার্ভারে সমস্যা হয়েছে।');
    }
});


// ==========================================
// 🔥 DATA ENTRY LOGIC 🔥
// ==========================================
bot.hears('📝 Create Sheet', async (ctx) => {
    await supabase.from('bot_sessions').upsert({ chat_id: ctx.chat.id, step: 'WAITING_FOR_COLUMNS', column_names: [], permanent_settings: {}, current_column_idx: 0, current_row_data: {}, data: [], edit_target: {} });
    return ctx.reply('👉 *শুরু করতে আপনার শিটের কলামগুলোর নাম কমা (,) দিয়ে দিন:*\n📝 উদাহরণ: UID, Password, Cookies');
});

bot.on('text', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const text = ctx.message.text.trim();

        if (text.startsWith('/') || text === '📱 Get Number (OTP)' || text === '📝 Create Sheet' || text === '💳 My Account') return;

        let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
        if (!session || session.step === 'MAIN_MENU') return;

        if (session.step === 'WAITING_FOR_COLUMNS') {
            const cols = text.split(',').map(c => c.trim()).filter(c => c.length > 0);
            await supabase.from('bot_sessions').update({ column_names: cols, step: 'ASK_PERMANENT_CHOICE' }).eq('chat_id', chatId);
            
            const buttons = cols.map(col => [Markup.button.callback(`📌 ${col} পার্মানেন্ট করুন`, `make_perm_${col}`)]);
            buttons.push([Markup.button.callback('⏭️ কোনোটিই নয় (ডাটা এন্ট্রি শুরু)', 'skip_permanent')]);
            return ctx.reply('✨ কলাম সেটআপ সফল! কোনো ভ্যালু কি পার্মানেন্ট করতে চান?', Markup.inlineKeyboard(buttons));
        }

        if (session.step.startsWith('WAITING_PERM_VAL_')) {
            const colName = session.step.replace('WAITING_PERM_VAL_', '');
            session.permanent_settings[colName] = text;
            
            await supabase.from('bot_sessions').update({ permanent_settings: session.permanent_settings, step: 'ASK_PERMANENT_CHOICE' }).eq('chat_id', chatId);
            
            const buttons = session.column_names.map(col => [Markup.button.callback(session.permanent_settings[col] ? `✅ ${col} (${session.permanent_settings[col]})` : `📌 ${col} পার্মানেন্ট করুন`, `make_perm_${col}`)]);
            buttons.push([Markup.button.callback('🚀 ডাটা এন্ট্রি শুরু করুন', 'skip_permanent')]);
            return ctx.reply(`✅ ${colName} পার্মানেন্ট হয়েছে। আর কিছু সেট করবেন?`, Markup.inlineKeyboard(buttons));
        }

        if (session.step === 'WAITING_EDIT_VAL') {
            const rowIdx = session.edit_target.row - 1;
            const colName = session.edit_target.col;
            session.data[rowIdx][colName] = text;

            await supabase.from('bot_sessions').update({ data: session.data, step: 'DATA_ENTRY', edit_target: {} }).eq('chat_id', chatId);
            return ctx.reply(`✅ Row ${session.edit_target.row} এর [ ${colName} ] সফলভাবে আপডেট হয়েছে! পরবর্তী সাধারণ ইনপুট দিন।`);
        }

        if (session.step === 'DATA_ENTRY') {
            const cols = session.column_names;
            let colName = cols[session.current_column_idx];

            if (session.current_column_idx === 0 && session.data.some(row => row[colName] === text)) {
                return ctx.reply(`⚠️ এই [ ${colName} ] আগেই প্রবেশ করানো হয়েছে! নতুন একটি দিন।`);
            }
            
            session.current_row_data[colName] = text;
            session.current_column_idx++;
            
            // Move to next column logic
            while (session.current_column_idx < cols.length) {
                const cName = cols[session.current_column_idx];
                if (session.permanent_settings[cName] !== undefined) {
                    session.current_row_data[cName] = session.permanent_settings[cName];
                    session.current_column_idx++;
                } else break;
            }

            if (session.current_column_idx >= cols.length) {
                session.data.push(session.current_row_data);
                const rowCount = session.data.length;
                session.current_row_data = {};
                session.current_column_idx = 0;
                
                // Move to next column logic again for new row
                while (session.current_column_idx < cols.length) {
                    const cName = cols[session.current_column_idx];
                    if (session.permanent_settings[cName] !== undefined) {
                        session.current_row_data[cName] = session.permanent_settings[cName];
                        session.current_column_idx++;
                    } else break;
                }

                await supabase.from('bot_sessions').update({
                    current_column_idx: session.current_column_idx,
                    current_row_data: session.current_row_data,
                    data: session.data
                }).eq('chat_id', chatId);

                return ctx.reply(
                    `✅ *Row ${rowCount} সেভ হয়েছে!*\n👉 *পরবর্তী Row এর জন্য [ ${cols[session.current_column_idx]} ] দিন:*`,
                    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
                        [{ text: '📊 Status', callback_data: 'status' }, { text: '↩️ Undo Last', callback_data: 'undo' }],
                        [{ text: '💾 Save XLSX', callback_data: 'export_xlsx' }, { text: '📄 Save TXT', callback_data: 'export_txt' }]
                    ]}}
                );
            }

            await supabase.from('bot_sessions').update({ current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', chatId);
            return ctx.reply(`👉 এবার দিন [ ${cols[session.current_column_idx]} ]:`);
        }
    } catch (e) {
        console.error(e);
    }
});

bot.action(/^make_perm_/, async (ctx) => {
    const colName = ctx.callbackQuery.data.replace('make_perm_', '');
    await supabase.from('bot_sessions').update({ step: `WAITING_PERM_VAL_${colName}` }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery();
    ctx.reply(`✍️ [ ${colName} ] এর পার্মানেন্ট ভ্যালুটি লিখে পাঠান:`);
});

bot.action('skip_permanent', async (ctx) => {
    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    session.step = 'DATA_ENTRY'; session.current_column_idx = 0; session.current_row_data = {};
    
    // Move logic
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

bot.action('undo', async (ctx) => {
    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    if (!session.data || session.data.length === 0) return ctx.answerCbQuery('মুছার মতো ডাটা নেই!', { show_alert: true });
    
    session.data.pop();
    session.current_column_idx = 0; session.current_row_data = {};
    // Move logic
    while (session.current_column_idx < session.column_names.length) {
        const cName = session.column_names[session.current_column_idx];
        if (session.permanent_settings[cName] !== undefined) {
            session.current_row_data[cName] = session.permanent_settings[cName];
            session.current_column_idx++;
        } else break;
    }
    await supabase.from('bot_sessions').update({ data: session.data, current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery('শেষ এন্ট্রি মুছে ফেলা হয়েছে!');
    ctx.reply(`🗑️ সর্বশেষ Row মুছে ফেলা হয়েছে। বর্তমানে ${session.data.length} টি Row আছে।\n\n👉 আবার [ ${session.column_names[session.current_column_idx]} ] দিন:`);
});

bot.action('status', async (ctx) => {
    const { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    ctx.answerCbQuery(`✅ এ পর্যন্ত ${session.data.length} টি Row সেভ হয়েছে!`, { show_alert: true });
});

async function exportData(ctx, format) {
    const { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    if (!session.data || session.data.length === 0) return ctx.answerCbQuery('ফাঁকা শিট!', { show_alert: true });

    ctx.answerCbQuery('ফাইল তৈরি হচ্ছে...');
    try {
        const orderedData = session.data.map(row => {
            let newRow = {};
            session.column_names.forEach(col => { newRow[col] = row[col] || ''; });
            return newRow;
        });

        if (format === 'xlsx') {
            const ws = xlsx.utils.json_to_sheet(orderedData, { header: session.column_names });
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'FB_Data');
            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            await ctx.replyWithDocument({ source: buffer, filename: `FB_Data_${Date.now()}.xlsx` });
        } else if (format === 'txt') {
            const txtData = orderedData.map(row => session.column_names.map(col => row[col]).join('|')).join('\n');
            const buffer = Buffer.from(txtData, 'utf-8');
            await ctx.replyWithDocument({ source: buffer, filename: `FB_Data_${Date.now()}.txt` });
        }
        await supabase.from('bot_sessions').delete().eq('chat_id', ctx.chat.id);
        ctx.reply('🎉 ডাটা এক্সপোর্ট হয়েছে।');
    } catch (e) {
        ctx.reply('❌ এরর হয়েছে!');
    }
}

bot.action('export_xlsx', (ctx) => exportData(ctx, 'xlsx'));
bot.action('export_txt', (ctx) => exportData(ctx, 'txt'));

module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (error) { res.status(500).send('Error'); }
    } else { res.status(200).send('Pro Bot is Running Fine!'); }
};
