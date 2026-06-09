const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Voltxsms API Base URL
const VOLTX_BASE = 'https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api';
const CHANNEL_USERNAME = '@fb_worker_pro_OTP'; 

async function getVoltxHeaders() {
    return {
        'mauthapi': process.env.VOLTX_API_KEY || '', 
        'Content-Type': 'application/json'
    };
}

function moveToNextColumn(session) {
    let idx = session.current_column_idx;
    const cols = session.column_names;
    const perm = session.permanent_settings;
    while (idx < cols.length) {
        if (perm[cols[idx]] !== undefined) {
            session.current_row_data[cols[idx]] = perm[cols[idx]];
            idx++;
        } else {
            break;
        }
    }
    session.current_column_idx = idx;
    return session;
}

// 🔥 মেইন মেনু লজিক 🔥
async function sendMainMenu(ctx, chatId) {
    await supabase.from('bot_sessions').upsert({
        chat_id: chatId, step: 'MAIN_MENU',
        column_names: [], permanent_settings: {},
        current_column_idx: 0, current_row_data: {}, data: [], edit_target: {}
    });

    const intro = `🌟 *স্বাগতম প্রো-লেভেল ফেসবুক মার্কেটিং বটে!* 🌟\n\n`
                + `আপনার ডাটা এন্ট্রি এবং OTP নাম্বার ম্যানেজমেন্ট এখন আরও সহজ।\n\n`
                + `👉 *নিচের কিবোর্ড থেকে "📱 Get Number" এ চাপ দিন অথবা ডাটা এন্ট্রির কাজ সিলেক্ট করুন:*`;
    
    // নিচের কিবোর্ডে Get Number বাটন যোগ করা হলো
    await ctx.replyWithMarkdown(intro, Markup.keyboard([
        ['📱 Get Number (OTP)']
    ]).resize());

    return ctx.replyWithMarkdown(`👉 *ডাটা এন্ট্রি মেনু:*`, Markup.inlineKeyboard([
        [Markup.button.callback('📝 Create Sheet (শিট তৈরি)', 'sheet_create')]
    ]));
}

bot.command('start', (ctx) => sendMainMenu(ctx, ctx.chat.id));
bot.action('main_menu', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    return sendMainMenu(ctx, ctx.chat.id);
});

// ==========================================
// 🔥 VOLTXSMS API & OTP LOGIC 🔥
// ==========================================

bot.hears('📱 Get Number (OTP)', async (ctx) => {
    ctx.reply('🌐 *কোন প্যানেল থেকে ফেসবুকের নাম্বার নিতে চান?*', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '⚡ Voltxsms Panel', callback_data: 'voltx_menu' }]]
        }
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
            if(fbService && fbService.ranges) {
                fbRanges = fbService.ranges.map(r => r.replace(/X/g, ''));
            }
        }
        
        // এপিআই থেকে না পেলে ডিফল্ট কিছু রেঞ্জ দেখাবে
        if(fbRanges.length === 0) fbRanges = ['23275', '447', '22501']; 

        const buttons = fbRanges.map(r => [Markup.button.callback(`🔥 ${r}XXX (Active)`, `v_get_${r}`)]);
        ctx.reply('🔥 *ফেসবুকের জন্য বর্তমানে সবচেয়ে এক্টিভ রেঞ্জগুলো:*', Markup.inlineKeyboard(buttons));
    } catch(e) {
        ctx.reply('❌ Voltxsms সার্ভারের সাথে কানেক্ট করা যাচ্ছে না। API Key ঠিক আছে কিনা চেক করুন।');
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
                // মেসেজ থেকে শুধু কোডটুকু বের করার চেষ্টা
                const codeMatch = foundOtp.message.match(/\d{5,8}/);
                const code = codeMatch ? codeMatch[0] : foundOtp.message;

                const userMsg = `🎉 *ফেসবুক কোড সফলভাবে পাওয়া গেছে!*\n\n`
                              + `📱 *Number:* \`${fullNum}\`\n`
                              + `✉️ *Full SMS:* ${foundOtp.message}\n`
                              + `🔑 *Code:* \`${code}\`\n\n`
                              + `💡 _(কোডের ওপর ট্যাপ করে কপি করুন)_`;
                await ctx.replyWithMarkdown(userMsg);

                // চ্যানেলে মেসেজ পাঠানো (নাম্বার হাইড করে)
                const maskedNum = "******" + fullNum.slice(-4);
                const channelMsg = `🔥 *New Facebook Code Received!*\n\n`
                                 + `📱 *Number:* \`${maskedNum}\`\n`
                                 + `🔑 *Code:* \`${code}\`\n\n`
                                 + `🤖 _Powered by Pro Bot_`;
                
                // বট চ্যানেলের এডমিন না থাকলে এরর ইগনোর করবে
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
// 🔥 DATA ENTRY LOGIC (পূর্বের মতো নিখুঁত) 🔥
// ==========================================

bot.action('sheet_create', async (ctx) => {
    await supabase.from('bot_sessions').update({ step: 'WAITING_FOR_COLUMNS' }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery().catch(()=>{});
    return ctx.reply('👉 *শুরু করতে আপনার শিটের কলামগুলোর নাম কমা (,) দিয়ে দিন:*\n📝 উদাহরণ: UID, Password, Cookies', 
        Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]])
    );
});

bot.command('edit', async (ctx) => {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('⚠️ ব্যবহারবিধি: /edit <রো-নম্বর>\nউদাহরণ: /edit 5');
    
    const rowNum = parseInt(args[1]);
    const { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
    if (!session || !session.data || rowNum < 1 || rowNum > session.data.length) {
        return ctx.reply('❌ ভুল রো-নম্বর! এই নামের কোনো ডাটা নেই।');
    }
    const buttons = session.column_names.map(col => [Markup.button.callback(`✏️ ${col}`, `editcol_${rowNum}_${col}`)]);
    buttons.push([Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]);
    ctx.reply(`🛠️ Row ${rowNum} এর কোন কলামটি এডিট করতে চান?`, Markup.inlineKeyboard(buttons));
});

bot.on('text', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const text = ctx.message.text.trim();

        if (text.startsWith('/') || text === '📱 Get Number (OTP)') return;

        let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
        if (!session || session.step === 'MAIN_MENU') return;

        if (session.step === 'WAITING_FOR_COLUMNS') {
            const cols = text.split(',').map(c => c.trim()).filter(c => c.length > 0);
            await supabase.from('bot_sessions').update({ column_names: cols, step: 'ASK_PERMANENT_CHOICE' }).eq('chat_id', chatId);
            
            const buttons = cols.map(col => [Markup.button.callback(`📌 ${col} পার্মানেন্ট করুন`, `make_perm_${col}`)]);
            buttons.push([Markup.button.callback('⏭️ কোনোটিই নয় (ডাটা এন্ট্রি শুরু)', 'skip_permanent')]);
            buttons.push([Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]);
            return ctx.reply('✨ কলাম সেটআপ সফল! কোনো ভ্যালু কি পার্মানেন্ট করতে চান?', Markup.inlineKeyboard(buttons));
        }

        if (session.step.startsWith('WAITING_PERM_VAL_')) {
            const colName = session.step.replace('WAITING_PERM_VAL_', '');
            session.permanent_settings[colName] = text;
            
            await supabase.from('bot_sessions').update({ permanent_settings: session.permanent_settings, step: 'ASK_PERMANENT_CHOICE' }).eq('chat_id', chatId);
            
            const buttons = session.column_names.map(col => [Markup.button.callback(session.permanent_settings[col] ? `✅ ${col} (${session.permanent_settings[col]})` : `📌 ${col} পার্মানেন্ট করুন`, `make_perm_${col}`)]);
            buttons.push([Markup.button.callback('🚀 ডাটা এন্ট্রি শুরু করুন', 'skip_permanent')]);
            buttons.push([Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]);
            return ctx.reply(`✅ ${colName} পার্মানেন্ট হয়েছে। আর কিছু সেট করবেন?`, Markup.inlineKeyboard(buttons));
        }

        if (session.step === 'WAITING_EDIT_VAL') {
            const rowIdx = session.edit_target.row - 1;
            const colName = session.edit_target.col;
            session.data[rowIdx][colName] = text;

            await supabase.from('bot_sessions').update({ data: session.data, step: 'DATA_ENTRY', edit_target: {} }).eq('chat_id', chatId);
            return ctx.reply(`✅ Row ${session.edit_target.row} এর [ ${colName} ] সফলভাবে আপডেট হয়েছে! পরবর্তী সাধারণ ইনপুট দিন।`, Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]]));
        }

        if (session.step === 'DATA_ENTRY') {
            const cols = session.column_names;
            let colName = cols[session.current_column_idx];

            if (session.current_column_idx === 0) {
                const isDuplicate = session.data.some(row => row[colName] === text);
                if (isDuplicate) return ctx.reply(`⚠️ এই [ ${colName} ] আগেই প্রবেশ করানো হয়েছে! নতুন একটি দিন।`);
            }
            
            session.current_row_data[colName] = text;
            session.current_column_idx++;
            session = moveToNextColumn(session);

            if (session.current_column_idx >= cols.length) {
                session.data.push(session.current_row_data);
                const rowCount = session.data.length;
                session.current_row_data = {};
                session.current_column_idx = 0;
                session = moveToNextColumn(session);

                await supabase.from('bot_sessions').update({
                    current_column_idx: session.current_column_idx,
                    current_row_data: session.current_row_data,
                    data: session.data
                }).eq('chat_id', chatId);

                const nextCol = cols[session.current_column_idx];
                return ctx.reply(
                    `✅ *Row ${rowCount} সেভ হয়েছে!*\n💡 _ভুল হলে এডিট করতে টাইপ করুন: /edit ${rowCount}_\n\n👉 *পরবর্তী Row এর জন্য [ ${nextCol} ] দিন:*`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📊 Status', callback_data: 'status' }, { text: '↩️ Undo Last', callback_data: 'undo' }],
                                [{ text: '💾 Save XLSX', callback_data: 'export_xlsx' }, { text: '📄 Save TXT', callback_data: 'export_txt' }],
                                [{ text: '🏠 মেইন মেনু', callback_data: 'main_menu' }]
                            ]
                        }
                    }
                );
            }

            await supabase.from('bot_sessions').update({ current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', chatId);
            return ctx.reply(`👉 এবার দিন [ ${cols[session.current_column_idx]} ]:`, Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু (বাতিল)', 'main_menu')]]));
        }
    } catch (e) {
        console.error(e);
    }
});

bot.action(/^make_perm_/, async (ctx) => {
    const colName = ctx.callbackQuery.data.replace('make_perm_', '');
    await supabase.from('bot_sessions').update({ step: `WAITING_PERM_VAL_${colName}` }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery();
    ctx.reply(`✍️ [ ${colName} ] এর পার্মানেন্ট ভ্যালুটি লিখে পাঠান:`, Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]]));
});

bot.action('skip_permanent', async (ctx) => {
    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    session.step = 'DATA_ENTRY'; session.current_column_idx = 0; session.current_row_data = {};
    session = moveToNextColumn(session);
    await supabase.from('bot_sessions').update({ step: session.step, current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery();
    ctx.reply(`🚀 *ডাটা এন্ট্রি শুরু!*\n\n👉 প্রথম Row এর জন্য [ ${session.column_names[session.current_column_idx]} ] দিন:`, Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]]));
});

bot.action(/^editcol_/, async (ctx) => {
    const [, rowStr, colName] = ctx.callbackQuery.data.split('_');
    const rowNum = parseInt(rowStr);
    await supabase.from('bot_sessions').update({ step: 'WAITING_EDIT_VAL', edit_target: { row: rowNum, col: colName } }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery();
    ctx.reply(`✍️ Row ${rowNum} এর নতুন [ ${colName} ] লিখে পাঠান:`, Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]]));
});

bot.action('undo', async (ctx) => {
    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    if (!session.data || session.data.length === 0) return ctx.answerCbQuery('মুছার মতো ডাটা নেই!', { show_alert: true });
    
    session.data.pop();
    session.current_column_idx = 0; session.current_row_data = {};
    session = moveToNextColumn(session);
    await supabase.from('bot_sessions').update({ data: session.data, current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery('শেষ এন্ট্রি মুছে ফেলা হয়েছে!');
    ctx.reply(`🗑️ সর্বশেষ Row মুছে ফেলা হয়েছে। বর্তমানে ${session.data.length} টি Row আছে।\n\n👉 আবার [ ${session.column_names[session.current_column_idx]} ] দিন:`, Markup.inlineKeyboard([[Markup.button.callback('🏠 মেইন মেনু', 'main_menu')]]));
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
        ctx.reply('🎉 ডাটা এক্সপোর্ট হয়েছে। নতুন কাজ করতে মেইন মেনু থেকে সিলেক্ট করুন।');
        setTimeout(() => { sendMainMenu(ctx, ctx.chat.id); }, 1000);
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
