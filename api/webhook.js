const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// 🔑 Tokens & API Keys
const BOT_TOKEN = '8996723108:AAHZO_pjAT3VxwcMTZyCMepVVGEWsv7vJTI';
const SUPABASE_URL = 'https://jdxcxzduqdifptxqwdsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z6nmoFPeJz7N0eg846bgqg_SC880WaC';

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 🗄️ SUPABASE DATABASE FUNCTIONS
// ==========================================
async function getUserData(userId) {
    let { data, error } = await supabase.from('finance_users').select('*').eq('user_id', userId.toString()).single();
    if (!data) {
        const newUser = {
            user_id: userId.toString(),
            balances: { bkash: 0, nagad: 0, rocket: 0, bank: 0, cash: 0, usd: 0 },
            transactions: [],
            loans: []
        };
        await supabase.from('finance_users').insert([newUser]);
        return newUser;
    }
    return data;
}

async function updateUserData(userId, updateFields) {
    await supabase.from('finance_users').update(updateFields).eq('user_id', userId.toString());
}

// ==========================================
// 🎨 PRO UI TEMPLATES & KEYBOARDS
// ==========================================
const getMainMenuKeyboard = () => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📊 মাসিক রিপোর্ট', 'menu_monthly'), Markup.button.callback('📜 লেনদেন হিস্ট্রি', 'menu_history')],
        [Markup.button.callback('🏦 লোন ম্যানেজমেন্ট', 'menu_loan'), Markup.button.callback('🛠️ ডিজিটাল টুলস', 'menu_tools')],
        [Markup.button.callback('💡 কীভাবে এন্ট্রি করবেন?', 'menu_help')]
    ]);
};

const getBackButton = () => {
    return Markup.inlineKeyboard([[Markup.button.callback('🔙 ড্যাশবোর্ডে ফিরে যান', 'menu_main')]]);
};

// ==========================================
// 🚀 MAIN DASHBOARD GENERATOR
// ==========================================
async function generateDashboardText(userId) {
    const user = await getUserData(userId);
    const b = user.balances;
    const total = b.bkash + b.nagad + b.rocket + b.bank + b.cash;
    
    const today = new Date().toDateString();
    const todayExpense = user.transactions
        .filter(t => t.type === 'expense' && new Date(t.date).toDateString() === today)
        .reduce((sum, t) => sum + t.amount, 0);

    return `💠 *PRO FINANCE DASHBOARD* 💠\n`
         + `━━━━━━━━━━━━━━━━━━━━━━\n`
         + `👤 *ইউজার:* Tanvir Siyam\n`
         + `💰 *নেট ব্যালেন্স:* ${total.toLocaleString('en-IN')} ৳\n`
         + `📉 *আজকের খরচ:* ${todayExpense.toLocaleString('en-IN')} ৳\n\n`
         + `🏦 *অ্যাকাউন্ট সামারি:*\n`
         + ` ├ 🌸 Bkash:  ${b.bkash.toLocaleString('en-IN')} ৳\n`
         + ` ├ 🔴 Nagad:  ${b.nagad.toLocaleString('en-IN')} ৳\n`
         + ` ├ 💜 Rocket: ${b.rocket.toLocaleString('en-IN')} ৳\n`
         + ` ├ 🏛️ Bank:   ${b.bank.toLocaleString('en-IN')} ৳\n`
         + ` ├ 💵 Cash:   ${b.cash.toLocaleString('en-IN')} ৳\n`
         + ` └ 💲 USD:    $${b.usd}\n`
         + `━━━━━━━━━━━━━━━━━━━━━━\n`
         + `⚡ *Quick Entry:* চ্যাটে লিখুন \`আয় 500 bkash\` বা \`খরচ 200 nagad\``;
}

// ==========================================
// 🔥 CORE COMMANDS & NAVIGATION 🔥
// ==========================================
bot.command('start', async (ctx) => {
    const text = await generateDashboardText(ctx.from.id);
    // আগের পুরোনো কীবোর্ড রিমুভ করে ইনলাইন কীবোর্ড দেওয়া
    ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } })
       .then(() => ctx.reply('মেনু থেকে অপশন নির্বাচন করুন:', { ...getMainMenuKeyboard() }));
});

// Main Menu Action (Back Button)
bot.action('menu_main', async (ctx) => {
    const text = await generateDashboardText(ctx.from.id);
    try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getMainMenuKeyboard() });
    } catch (e) {} // Text same থাকলে error ignore করবে
    ctx.answerCbQuery();
});

// ==========================================
// 📅 MONTHLY REPORT
// ==========================================
bot.action('menu_monthly', async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthlyIncome = 0; let monthlyExpense = 0;

    user.transactions.forEach(t => {
        const txDate = new Date(t.date);
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            if (t.type === 'income') monthlyIncome += t.amount;
            else monthlyExpense += t.amount;
        }
    });

    const monthName = now.toLocaleString('en-US', { month: 'long' });
    const text = `📅 *MONTHLY REPORT: ${monthName.toUpperCase()} ${currentYear}*\n`
               + `━━━━━━━━━━━━━━━━━━━━━━\n`
               + `🟢 *মোট আয়:* ${monthlyIncome.toLocaleString('en-IN')} ৳\n`
               + `🔴 *মোট ব্যয়:* ${monthlyExpense.toLocaleString('en-IN')} ৳\n\n`
               + `💡 *মাসিক সঞ্চয়:* ${(monthlyIncome - monthlyExpense).toLocaleString('en-IN')} ৳`;

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackButton() }).catch(()=>{});
    ctx.answerCbQuery();
});

// ==========================================
// 📜 HISTORY VIEWER
// ==========================================
bot.action('menu_history', async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const txs = user.transactions;
    
    if (txs.length === 0) {
        await ctx.editMessageText('📭 আপনার কোনো লেনদেনের হিস্ট্রি নেই।', { ...getBackButton() }).catch(()=>{});
        return ctx.answerCbQuery();
    }

    const recentTxs = txs.slice(-10).reverse();
    let text = `📜 *RECENT TRANSACTIONS (Last 10)*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    recentTxs.forEach((t) => {
        const icon = t.type === 'income' ? '🟢' : '🔴';
        const date = new Date(t.date).toLocaleDateString('en-GB');
        text += `${icon} *${t.amount}* ${t.method === 'usd' ? '$' : '৳'} \n└ 💳 ${t.method.toUpperCase()} | 📝 ${t.note} | 📅 ${date}\n\n`;
    });

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackButton() }).catch(()=>{});
    ctx.answerCbQuery();
});

// ==========================================
// 🏦 LOAN TRACKER
// ==========================================
bot.action('menu_loan', async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const loans = user.loans;

    let text = `🏦 *LOAN MANAGEMENT*\n━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (loans.length === 0) {
        text += `আপনার বর্তমানে কোনো লোন নেই।\n\n`;
    } else {
        loans.forEach((l) => {
            const progress = Math.round((l.paid / l.amount) * 10);
            const bar = '█'.repeat(progress) + '░'.repeat(10 - progress);
            const percentage = Math.round((l.paid / l.amount) * 100);

            text += `🔹 *${l.name}*\n`
                 +  `💰 মোট: ${l.amount} ৳ | শোধ: ${l.paid} ৳\n`
                 +  `📊 [${bar}] ${percentage}%\n`
                 +  `📅 কিস্তি: প্রতি মাসের ${l.date} তারিখ\n\n`;
        });
    }

    text += `➕ *নতুন লোন যুক্ত করতে চ্যাটে লিখুন:*\n`
          + `\`/addloan [নাম] [মোট টাকা] [কত শোধ করেছেন] [কিস্তির তারিখ]\``;

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackButton() }).catch(()=>{});
    ctx.answerCbQuery();
});

// ==========================================
// 🛠️ DIGITAL TOOLS & HELP
// ==========================================
bot.action('menu_tools', async (ctx) => {
    const text = `🛠️ *DIGITAL MARKETING TOOLS*\n━━━━━━━━━━━━━━━━━━━━━━\n`
               + `🔗 */short [লিংক]* - যেকোনো বড় লিংক শর্ট করতে।\n`
               + `📧 */mail* - নতুন টেম্পোরারি (ফেক) ইমেইল পেতে।\n`
               + `#️⃣ */tags [বিষয়]* - পোস্টের জন্য ভাইরাল হ্যাশট্যাগ পেতে।`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackButton() }).catch(()=>{});
    ctx.answerCbQuery();
});

bot.action('menu_help', async (ctx) => {
    const text = `💡 *SMART ENTRY GUIDE*\n━━━━━━━━━━━━━━━━━━━━━━\n`
               + `চ্যাটে সরাসরি নিচের মতো করে লিখুন:\n\n`
               + `✅ *আয় যুক্ত করতে:*\n`
               + `\`আয় 500 bkash টিউশনি\`\n\n`
               + `❌ *খরচ যুক্ত করতে:*\n`
               + `\`খরচ 200 nagad ইন্টারনেট বিল\``;
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackButton() }).catch(()=>{});
    ctx.answerCbQuery();
});

// ==========================================
// 💰 SMART INCOME/EXPENSE LISTENER
// ==========================================
bot.hears(/^(আয়|আয়|খরচ|ব্যয়|ব্যয়)\s+(\d+)\s+(bkash|nagad|rocket|bank|cash|usd)\s+(.+)$/i, async (ctx) => {
    const match = ctx.match;
    const type = (match[1] === 'খরচ' || match[1] === 'ব্যয়' || match[1] === 'ব্যয়') ? 'expense' : 'income';
    const amount = parseInt(match[2]);
    const method = match[3].toLowerCase();
    const note = match[4];

    const user = await getUserData(ctx.from.id);

    if (type === 'expense' && user.balances[method] < amount) {
        return ctx.reply(`⚠️ আপনার ${method.toUpperCase()} অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!`);
    }

    if (type === 'income') user.balances[method] += amount;
    else user.balances[method] -= amount;

    user.transactions.push({
        type: type, amount: amount, method: method, note: note, date: new Date().toISOString()
    });

    await updateUserData(ctx.from.id, { balances: user.balances, transactions: user.transactions });

    const text = `✅ *${type === 'income' ? 'INCOME' : 'EXPENSE'} ADDED!*\n`
               + `💰 পরিমাণ: ${amount} ${method === 'usd' ? '$' : '৳'}\n`
               + `💳 মাধ্যম: ${method.toUpperCase()}\n`
               + `📝 নোট: ${note}`;
               
    // নোটিফিকেশন দেওয়ার পর নতুন করে ড্যাশবোর্ড মেনু পাঠিয়ে দেবে
    ctx.reply(text, { parse_mode: 'Markdown' }).then(() => {
        generateDashboardText(ctx.from.id).then(dashText => {
            ctx.reply(dashText, { parse_mode: 'Markdown', ...getMainMenuKeyboard() });
        });
    });
});

// ==========================================
// ➕ ADD LOAN COMMAND & OTHERS
// ==========================================
bot.command('addloan', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('❌ সঠিক নিয়ম: `/addloan [নাম] [মোট টাকা] [কত শোধ করেছেন] [কিস্তির তারিখ]`', { parse_mode: 'Markdown' });

    const user = await getUserData(ctx.from.id);
    user.loans.push({ name: args[1], amount: parseInt(args[2]), paid: parseInt(args[3]), date: args[4] });

    await updateUserData(ctx.from.id, { loans: user.loans });
    ctx.reply(`✅ *${args[1]}* লোনটি সফলভাবে যুক্ত হয়েছে!`, { parse_mode: 'Markdown', ...getBackButton() });
});

bot.command('short', async (ctx) => {
    const text = ctx.message.text.split(' ');
    if (text.length < 2) return ctx.reply('❌ *সঠিক নিয়ম:* `/short আপনার_লিংক`', { parse_mode: 'Markdown' });
    try {
        const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text[1])}`);
        const shortUrl = await res.text();
        ctx.reply(`✅ *আপনার শর্ট লিংক:*\n🔗 ${shortUrl}`, { parse_mode: 'Markdown' });
    } catch (e) { ctx.reply('❌ সমস্যা হয়েছে!'); }
});

bot.command('mail', async (ctx) => {
    try {
        const res = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        const data = await res.json();
        const email = data[0];
        const [login, domain] = email.split('@');
        ctx.reply(`📧 *টেম্পোরারি ইমেইল:*\n👉 \`${email}\`\n\n📥 [ইনবক্স চেক করুন](https://www.1secmail.com/mailbox/?email=${login}&domain=${domain})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (e) { ctx.reply('❌ সার্ভার সমস্যা!'); }
});

bot.command('tags', (ctx) => {
    const keyword = ctx.message.text.replace('/tags', '').trim().replace(/\s+/g, '');
    if (!keyword) return ctx.reply('❌ সঠিক নিয়ম: `/tags fashion`', { parse_mode: 'Markdown' });
    ctx.reply(`🔥 *হ্যাশট্যাগ:*\n\`#${keyword} #${keyword}lovers #viral #trending #fyp\``, { parse_mode: 'Markdown' });
});

// ==========================================
// 🔥 VERCEL SERVER HANDLER 🔥
// ==========================================
module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } 
        catch (error) { res.status(500).send('Error'); }
    } else { res.status(200).send('PRO Finance Bot Live!'); }
};
