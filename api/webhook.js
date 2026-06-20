const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// 🔑 HARDCODED API KEYS (NO ENV REQUIRED)
// ==========================================
const BOT_TOKEN = '8571540558:AAHv9KuMbl-Ct-yWZNJKXUxBCqdNHKSBPlA';
const ADMIN_ID = '5968392734';
const CHANNEL_ID = '@siyamXotp';

const SUPABASE_URL = 'https://ocrhnssxamusvlnkvzwn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3pT3XXRD3kvRq2b5vZZjeA_JRsTQhOg';

const STEX_API_KEY = 'M704VEUDSZ3';
const STEX_BASE_URL = 'https://api.2oo9.cloud/MXS47FLFX0U/tness/@public/api';

// Initialize Bot and Database safely
const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const STEX_HEADERS = { 'mauthapi': STEX_API_KEY, 'Content-Type': 'application/json' };

// ==========================================
// 🗄️ DATABASE HELPERS
// ==========================================
async function getUser(userId, username) {
    let { data } = await supabase.from('stex_users').select('*').eq('user_id', userId.toString()).single();
    if (!data) {
        data = { user_id: userId.toString(), username: username || 'User', current_prefix: null, status: 'idle', total_otps: 0 };
        await supabase.from('stex_users').insert([data]);
    }
    return data;
}

async function updateUser(userId, updates) {
    await supabase.from('stex_users').update(updates).eq('user_id', userId.toString());
}

// ==========================================
// 📱 BOTTOM KEYBOARD
// ==========================================
const mainMenu = Markup.keyboard([
    ['📱 Get Number', '🌐 Live Traffic'],
    ['👤 My Profile', '💳 Balance & Withdraw']
]).resize();

// ==========================================
// 🚀 BOT START & COMMANDS
// ==========================================
bot.command('start', async (ctx) => {
    try {
        await getUser(ctx.from.id, ctx.from.first_name);
        const welcomeMsg = `🌟 *Welcome to Premium OTP Bot!* 🌟\n\n`
                         + `⚡ Superfast, Reliable & High Access OTP service.\n`
                         + `Select an option from the menu below to get started.`;
        ctx.reply(welcomeMsg, { parse_mode: 'Markdown', ...mainMenu });
    } catch (e) {
        ctx.reply("❌ Database connection error. Please check Supabase setup.");
    }
});

bot.hears('💳 Balance & Withdraw', (ctx) => {
    ctx.reply('⏳ *Balance & Withdraw option is Coming Soon...*', { parse_mode: 'Markdown' });
});

bot.hears('👤 My Profile', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        const msg = `👤 *User Profile*\n━━━━━━━━━━━━━━━\n`
                  + `🆔 *ID:* \`${user.user_id}\`\n`
                  + `🔢 *Saved Prefix:* ${user.current_prefix ? user.current_prefix + 'XXX' : 'Not Set'}\n`
                  + `✅ *Total OTPs:* ${user.total_otps}`;
        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Failed to fetch profile.");
    }
});

bot.command('stats', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    try {
        const { count } = await supabase.from('stex_users').select('*', { count: 'exact', head: true });
        const { data } = await supabase.from('stex_users').select('total_otps');
        const totalOtps = data ? data.reduce((sum, u) => sum + u.total_otps, 0) : 0;
        ctx.reply(`👑 *ADMIN DASHBOARD*\n━━━━━━━━━━━━━━━\n👥 Total Users: ${count}\n✅ Total Global OTPs: ${totalOtps}`, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply("❌ Stats fetch failed.");
    }
});

bot.hears('🌐 Live Traffic', async (ctx) => {
    const msg = await ctx.reply('⏳ Fetching live global traffic...');
    try {
        const res = await fetch(`${STEX_BASE_URL}/console`, { headers: STEX_HEADERS });
        const json = await res.json();
        
        if (json.meta && json.meta.code === 200 && json.data.hits && json.data.hits.length > 0) {
            let text = `📊 *LIVE GLOBAL TRAFFIC (Last 15m)*\n━━━━━━━━━━━━━━━━━━━━\n`;
            json.data.hits.slice(0, 8).forEach(hit => {
                text += `📲 *${hit.sid}* | Range: \`${hit.range}\`\n💬 ${hit.message.substring(0, 20)}...\n\n`;
            });
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text, { parse_mode: 'Markdown' });
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '📭 No live traffic found right now.');
        }
    } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '❌ Failed to connect to server.');
    }
});

bot.hears('📱 Get Number', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        if (!user.current_prefix) {
            await updateUser(ctx.from.id, { status: 'waiting_prefix' });
            return ctx.reply('⚙️ *No Prefix Set!*\n\nPlease send the prefix range you want to use.\n*(Example: 236723XXX or 236723)*', { parse_mode: 'Markdown' });
        }
        sendNumberMenu(ctx, user.current_prefix);
    } catch (e) {}
});

bot.action('set_prefix', async (ctx) => {
    try {
        await updateUser(ctx.from.id, { status: 'waiting_prefix' });
        await ctx.editMessageText('⚙️ *Enter New Prefix Range*\n\nSend the numbers (e.g. 236723XXX) in the chat:', { parse_mode: 'Markdown' }).catch(()=>{});
    } catch (e) {}
});

bot.on('text', async (ctx, next) => {
    try {
        const user = await getUser(ctx.from.id);
        if (user.status === 'waiting_prefix') {
            const prefix = ctx.message.text.replace(/[^0-9]/g, ''); 
            if (prefix.length < 3) return ctx.reply('❌ Invalid prefix! Try again.');
            
            await updateUser(ctx.from.id, { current_prefix: prefix, status: 'idle' });
            ctx.reply(`✅ *Prefix successfully set to:* \`${prefix}XXX\``, { parse_mode: 'Markdown' });
            sendNumberMenu(ctx, prefix);
        } else {
            return next();
        }
    } catch (e) { return next(); }
});

function sendNumberMenu(ctx, prefix) {
    const text = `📱 *NUMBER GENERATOR*\n━━━━━━━━━━━━━━━\n🎯 *Current Target Range:* \`${prefix}XXX\`\n\nClick below to get a number:`;
    const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('📲 Get Number Now', 'get_new_number')],
        [Markup.button.callback('⚙️ Set Another Prefix', 'set_prefix')]
    ]);
    if (ctx.updateType === 'callback_query') {
        ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});
    } else {
        ctx.reply(text, { parse_mode: 'Markdown', ...buttons });
    }
}

bot.action('get_new_number', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        await ctx.editMessageText('⏳ Allocating a number for you...', { parse_mode: 'Markdown' }).catch(()=>{});

        const res = await fetch(`${STEX_BASE_URL}/getnum`, {
            method: 'POST',
            headers: STEX_HEADERS,
            body: JSON.stringify({ rid: user.current_prefix })
        });
        const json = await res.json();

        if (json.meta && json.meta.code === 200 && json.data && json.data.no_plus_number) {
            const num = json.data.no_plus_number;
            const fullNum = json.data.full_number;
            const operator = json.data.operator || 'Unknown';
            
            const text = `✅ *Number Allocated!*\n━━━━━━━━━━━━━━━\n`
                       + `📞 *Number:* \`${fullNum}\`\n`
                       + `📡 *Network:* ${operator}\n`
                       + `🎯 *Range:* ${user.current_prefix}XXX\n\n`
                       + `_Waiting for SMS... Click the Check OTP button below._`;

            const buttons = Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Check OTP', `chk_${num}`)],
                [Markup.button.callback('🔄 Change Number (Same Range)', 'get_new_number')],
                [Markup.button.callback('🔙 Back to Menu', 'back_menu')]
            ]);
            
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});
        } else {
            await ctx.editMessageText(`❌ *Stock Unavailable*\nNo numbers left in ${user.current_prefix}XXX range right now.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('⚙️ Set Another Prefix', 'set_prefix')]])
            }).catch(()=>{});
        }
    } catch (e) {
        await ctx.editMessageText('❌ API Error! Try again later.').catch(()=>{});
    }
});

bot.action(/chk_(.+)/, async (ctx) => {
    const targetNumber = ctx.match[1];
    try {
        const res = await fetch(`${STEX_BASE_URL}/success-otp`, { headers: STEX_HEADERS });
        const json = await res.json();
        
        if (json.meta && json.meta.code === 200 && json.data && json.data.otps) {
            const foundOtp = json.data.otps.find(otp => otp.number === targetNumber);
            if (foundOtp) {
                const text = `🎉 *OTP RECEIVED SUCCESSFULLY!*\n━━━━━━━━━━━━━━━\n`
                           + `📞 *Number:* \`+${foundOtp.number}\`\n`
                           + `💬 *Message:* \`${foundOtp.message}\``;
                
                const buttons = Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Get Another Number', 'get_new_number')],
                    [Markup.button.callback('🔙 Back to Menu', 'back_menu')]
                ]);
                await ctx.editMessageText(text, { parse_mode: 'Markdown', ...buttons }).catch(()=>{});

                const user = await getUser(ctx.from.id);
                await updateUser(ctx.from.id, { total_otps: user.total_otps + 1 });

                const channelMsg = `🔥 *NEW SUCCESSFUL OTP* 🔥\n\n👤 By: ${ctx.from.first_name}\n📞 Number: +${foundOtp.number}\n💬 Code: ${foundOtp.message}`;
                await bot.telegram.sendMessage(CHANNEL_ID, channelMsg).catch(()=> {});

                return ctx.answerCbQuery('✅ OTP Found!');
            }
        }
        ctx.answerCbQuery('⏳ Still waiting for OTP... Please click Check again in a few seconds.', { show_alert: true });
    } catch (e) {
        ctx.answerCbQuery('❌ Error connecting to server.');
    }
});

bot.action('back_menu', async (ctx) => {
    try {
        const user = await getUser(ctx.from.id);
        sendNumberMenu(ctx, user.current_prefix);
    } catch (e) {}
});

// ==========================================
// 🔥 VERCEL SERVERLESS HANDLER
// ==========================================
module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { 
            await bot.handleUpdate(req.body); 
            res.status(200).send('OK'); 
        } catch (error) { 
            console.error(error); // Logs detailed error in Vercel
            res.status(500).send('Webhook Error'); 
        }
    } else { 
        res.status(200).send('✅ STEX OTP Bot is Running Successfully!'); 
    }
};
