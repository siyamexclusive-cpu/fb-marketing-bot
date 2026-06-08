const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function moveToNextColumn(session) {
    let idx = session.current_column_idx;
    const cols = session.column_names;
    const perm = session.permanent_settings;

    while (idx < cols.length) {
        const colName = cols[idx];
        if (perm[colName] !== undefined) {
            session.current_row_data[colName] = perm[colName];
            idx++;
        } else {
            break;
        }
    }
    session.current_column_idx = idx;
    return session;
}

bot.command('start', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        await supabase.from('bot_sessions').upsert({
            chat_id: chatId, step: 'WAITING_FOR_COLUMNS',
            column_names: [], permanent_settings: {},
            current_column_idx: 0, current_row_data: {}, data: [], edit_target: {}
        });

        const intro = `🌟 *স্বাগতম প্রো-লেভেল ডাটা এন্ট্রি বটে!* 🌟\n\n`
                    + `আমি আপনার কাজকে দ্রুত ও নির্ভুল করতে তৈরি।\n`
                    + `🔹 ডুপ্লিকেট চেকার\n🔹 অটোমেটিক কলাম স্কিপ (পার্মানেন্ট)\n🔹 লাইভ এডিট ও আনডু\n🔹 TXT ও XLSX এক্সপোর্ট\n`
                    + `🔹 *নতুন:* ফেসবুক UID চেকার (/checkuid)\n\n`
                    + `👉 *শুরু করতে আপনার শিটের কলামগুলোর নাম কমা (,) দিয়ে দিন:*\n📝 উদাহরণ: UID, Password, Cookies`;
        
        ctx.replyWithMarkdown(intro, Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Bulk UID Check', 'bulk_uid_start')]
        ]));
    } catch (e) {
        console.error("Start command error:", e);
    }
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
    ctx.reply(`🛠️ Row ${rowNum} এর কোন কলামটি এডিট করতে চান?`, Markup.inlineKeyboard(buttons));
});

// 🔥 সিঙ্গেল UID চেকার (JSON আপডেট) 🔥
bot.command('checkuid', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('⚠️ ব্যবহারবিধি: /checkuid <ফেইসবুক-UID>\nউদাহরণ: /checkuid 100012345678901');
    
    const uid = args[1].trim();
    const waitMsg = await ctx.reply(`⏳ UID [ ${uid} ] চেক করা হচ্ছে...`);

    try {
        // redirect=false দিয়ে সরাসরি JSON ডাটা বের করা
        const url = `https://graph.facebook.com/${uid}/picture?redirect=false`;
        const response = await fetch(url);
        const data = await response.json();

        let statusText = '';
        let adviceText = '';

        if (data.error) {
             statusText = `❌ *Blocked / Disabled / Not Found*`;
             adviceText = `আইডিটি ডিজেবল বা ব্লক হয়ে গেছে। এটি আর কাজ করবে না।`;
        } else if (data.data && data.data.url) {
             statusText = `✅ *Active / Public*`;
             adviceText = `আইডিটি সচল আছে এবং ব্যবহারযোগ্য মনে হচ্ছে।`;
        } else {
             statusText = `⚠️ *Unknown Status*`;
             adviceText = `আইডিটির অবস্থা পরিষ্কার নয়।`;
        }

        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, 
            `🔍 *Facebook UID Check Result*\n\n` +
            `👤 *UID:* \`${uid}\`\n` +
            `📊 *Status:* ${statusText}\n\n` +
            `💡 *Advice:* ${adviceText}\n` +
            `🔗 [প্রোফাইল লিংক চেক করুন](https://www.facebook.com/${uid})`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );

    } catch (error) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, `❌ চেক করতে সমস্যা হয়েছে: ${error.message}`);
    }
});

bot.action('bulk_uid_start', async (ctx) => {
    try {
        await supabase.from('bot_sessions').update({ step: 'WAITING_BULK_UID' }).eq('chat_id', ctx.chat.id);
        ctx.answerCbQuery().catch(()=>{});
        ctx.reply('✍️ *একসাথে অনেকগুলো UID পেস্ট করে পাঠিয়ে দিন.*\n\n(আপনি প্রতি লাইনে একটি করে UID দিতে পারেন, অথবা পুরো আইডি লগ পেস্ট করে দিলেও আমি নিজে থেকে UID গুলো আলাদা করে নেব।)');
    } catch (e) {
        console.error(e);
    }
});

bot.on('text', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const text = ctx.message.text.trim();

        if (text.startsWith('/')) return;

        let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
        if (!session) return ctx.reply('অনুগ্রহ করে /start দিয়ে শুরু করুন।');

        // 🔥 বাল্ক ইউআইডি চেকার (JSON আপডেট) 🔥
        if (session.step === 'WAITING_BULK_UID') {
            const lines = text.split('\n');
            const uids = lines.map(line => {
                const part = line.split(/[|,\s]+/)[0].trim();
                return /^\d{5,18}$/.test(part) ? part : null;
            }).filter(Boolean);

            if (uids.length === 0) {
                return ctx.reply('❌ কোনো বৈধ ফেসবুক ইউআইডি (UID) পাওয়া যায়নি! দয়া করে সঠিক নম্বরের লিস্ট দিন।');
            }

            const waitMsg = await ctx.reply(`⏳ মোট ${uids.length}টি UID চেক করা হচ্ছে... অনুগ্রহ করে একটু অপেক্ষা করুন।`);
            let resultText = `🔍 *বাল্ক ইউআইডি চেকিং রেজাল্ট:*\n\n`;

            for (let i = 0; i < uids.length; i++) {
                const uid = uids[i];
                try {
                    const response = await fetch(`https://graph.facebook.com/${uid}/picture?redirect=false`);
                    const data = await response.json();
                    
                    if (data.error) {
                        resultText += `\`${uid}\`  ❌\n`;
                    } else if (data.data && data.data.url) {
                        resultText += `\`${uid}\`  ✅\n`;
                    } else {
                        resultText += `\`${uid}\`  ❌\n`;
                    }
                } catch (err) {
                    resultText += `\`${uid}\`  ❌\n`;
                }
            }

            const nextStep = session.column_names && session.column_names.length > 0 ? 'DATA_ENTRY' : 'WAITING_FOR_COLUMNS';
            await supabase.from('bot_sessions').update({ step: nextStep }).eq('chat_id', chatId);

            await ctx.telegram.deleteMessage(chatId, waitMsg.message_id).catch(()=>{});
            return ctx.replyWithMarkdown(resultText + `\n💡 *চেকিং সম্পন্ন হয়েছে!* আপনার আগের ডাটা এন্ট্রি সেশনটি বহাল আছে।`);
        }

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
                                [{ text: '🔍 Bulk UID Check', callback_data: 'bulk_uid_start' }]
                            ]
                        }
                    }
                );
            }

            await supabase.from('bot_sessions').update({ current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', chatId);
            return ctx.reply(`👉 এবার দিন [ ${cols[session.current_column_idx]} ]:`);
        }
    } catch (e) {
        console.error("Text handler error:", e);
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
    session = moveToNextColumn(session);
    await supabase.from('bot_sessions').update({ step: session.step, current_column_idx: session.current_column_idx, current_row_data: session.current_row_data }).eq('chat_id', ctx.chat.id);
    
    ctx.answerCbQuery();
    ctx.reply(`🚀 *ডাটা এন্ট্রি শুরু!*\n\n👉 প্রথম Row এর জন্য [ ${session.column_names[session.current_column_idx]} ] দিন:`, { parse_mode: 'Markdown' });
});

bot.action(/^editcol_/, async (ctx) => {
    const [, rowStr, colName] = ctx.callbackQuery.data.split('_');
    const rowNum = parseInt(rowStr);
    await supabase.from('bot_sessions').update({ step: 'WAITING_EDIT_VAL', edit_target: { row: rowNum, col: colName } }).eq('chat_id', ctx.chat.id);
    ctx.answerCbQuery();
    ctx.reply(`✍️ Row ${rowNum} এর নতুন [ ${colName} ] লিখে পাঠান:`);
});

bot.action('undo', async (ctx) => {
    let { data: session } = await supabase.from('bot_sessions').select('*').eq('chat_id', ctx.chat.id).single();
    if (!session.data || session.data.length === 0) return ctx.answerCbQuery('মুছার মতো কোনো ডাটা নেই!', { show_alert: true });
    
    session.data.pop();
    session.current_column_idx = 0; session.current_row_data = {};
    session = moveToNextColumn(session);
    
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
            session.column_names.forEach(col => {
                newRow[col] = row[col] || ''; 
            });
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
        ctx.reply('🎉 ডাটা এক্সপোর্ট হয়েছে এবং মেমোরি ক্লিয়ার করা হয়েছে। নতুন কাজ করতে /start দিন।');
    } catch (e) {
        ctx.reply('❌ এরর হয়েছে!');
    }
}

bot.action('export_xlsx', (ctx) => exportData(ctx, 'xlsx'));
bot.action('export_txt', (ctx) => exportData(ctx, 'txt'));

module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } catch (error) {
            console.error("❌ Error:", error);
            res.status(500).send('Error');
        }
    } else {
        res.status(200).send('Pro Bot is Running Fine!');
    }
};
