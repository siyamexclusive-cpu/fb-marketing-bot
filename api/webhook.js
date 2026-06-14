const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// 🔑 Tokens & API Keys (আপনার দেওয়া সরাসরি কি)
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
// 📱 CUSTOM KEYBOARD MENU
// ==========================================
const mainMenu = Markup.keyboard([
    ['💰 ড্যাশবোর্ড', '📅 চলতি মাসের হিসাব'],
    ['🏦 লোন ট্র্যাকার', '📜 শেষ ১০টি হিস্ট্রি'],
    ['➕ আয়/ব্যয় যুক্ত করার নিয়ম', '🛠️ ডিজিটাল টুলস']
]).resize();

// ==========================================
// 🔥 START COMMAND 🔥
// ==========================================
bot.command('start', async (ctx) => {
    await getUserData(ctx.from.id);
    ctx.reply(`👋 *স্বাগতম আপনার স্মার্ট ফিন্যান্স ও ম্যানেজমেন্ট বটে!*\n\nনিচের কীবোর্ড মেনু থেকে যেকোনো অপশন বেছে নিন:`, { parse_mode: 'Markdown', ...mainMenu });
});

// ==========================================
// 📊 DASHBOARD
// ==========================================
bot.hears('💰 ড্যাশবোর্ড', async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const b = user.balances;
    
    const total = b.bkash + b.nagad + b.rocket + b.bank + b.cash;
    const today = new Date().toDateString();
    const todayExpense = user.transactions
        .filter(t => t.type === 'expense' && new Date(t.date).toDateString() === today)
        .reduce((sum, t) => sum + t.amount, 0);

    const msg = `📊 *আপনার ফিন্যান্স ড্যাশবোর্ড*\n`
              + `━━━━━━━━━━━━━━━━\n`
              + `💵 *মোট ব্যালেন্স:* ${total} ৳\n`
              + `📉 *আজকের খরচ:* ${todayExpense} ৳\n\n`
              + `*অ্যাকাউন্ট ডিটেইলস:*\n`
              + `🌸 Bkash: ${b.bkash} ৳\n`
              + `🔴 Nagad: ${b.nagad} ৳\n`
              + `💜 Rocket: ${b.rocket} ৳\n`
              + `🏦 Bank: ${b.bank} ৳\n`
              + `💵 Cash: ${b.cash} ৳\n`
              + `💲 Dollar: $${b.usd}\n`
              + `━━━━━━━━━━━━━━━━`;

    ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        Markup.button.callback('📜 খরচের হিস্ট্রি (History)', 'show_history')
    ]));
});

// ==========================================
// 📅 MONTHLY REPORT (Bonus Feature)
// ==========================================
bot.hears('📅 চলতি মাসের হিসাব', async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthlyIncome = 0;
    let monthlyExpense = 0;

    user.transactions.forEach(t => {
        const txDate = new Date(t.date);
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            if (t.type === 'income') monthlyIncome += t.amount;
            else monthlyExpense += t.amount;
        }
    });

    const monthName = now.toLocaleString('en-US', { month: 'long' });
    const msg = `📅 *${monthName} ${currentYear} এর রিপোর্ট*\n`
              + `━━━━━━━━━━━━━━━━\n`
              + `🟢 *মোট আয়:* ${monthlyIncome} ৳\n`
              + `🔴 *মোট ব্যয়:* ${monthlyExpense} ৳\n\n`
              + `💡 *মাসিক সঞ্চয়:* ${monthlyIncome - monthlyExpense} ৳`;

    ctx.replyWithMarkdown(msg);
});

// ==========================================
// 💰 SMART INCOME/EXPENSE TRACKER
// ==========================================
bot.hears('➕ আয়/ব্যয় যুক্ত করার নিয়ম', (ctx) => {
    const msg = `💡 *অটোমেটিক আয় ও ব্যয় যুক্ত করার নিয়ম:*\n\n`
              + `চ্যাটে সরাসরি নিচের মতো করে লিখুন, বট নিজে থেকে ব্যালেন্স আপডেট করে নেবে!\n\n`
              + `✅ *আয় যুক্ত করতে:*\n`
              + `\`আয় 500 bkash টিউশনি ফি\`\n\n`
              + `❌ *ব্যয়/খরচ যুক্ত করতে:*\n`
              + `\`খরচ 200 nagad মোবাইল রিচার্জ\``;
    ctx.replyWithMarkdown(msg);
});

bot.hears(/^(আয়|আয়|খরচ|ব্যয়|ব্যয়)\s+(\d+)\s+(bkash|nagad|rocket|bank|cash|usd)\s+(.+)$/i, async (ctx) => {
    const match = ctx.match;
    const type = (match[1] === 'খরচ' || match[1] === 'ব্যয়' || match[1] === 'ব্যয়') ? 'expense' : 'income';
    const amount = parseInt(match[2]);
    const method = match[3].toLowerCase();
    const note = match[4];

    const user = await getUserData(ctx.from.id);

    if (type === 'expense' && user.balances[method] < amount) {
        return ctx.reply(`⚠️ আপনার ${method} অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!`);
    }

    if (type === 'income') {
        user.balances[method] += amount;
    } else {
        user.balances[method] -= amount;
    }

    user.transactions.push({
        type: type,
        amount: amount,
        method: method,
        note: note,
        date: new Date().toISOString()
    });

    await updateUserData(ctx.from.id, { 
        balances: user.balances, 
        transactions: user.transactions 
    });

    ctx.reply(`✅ *${type === 'income' ? 'আয়' : 'খরচ'} সফলভাবে যুক্ত হয়েছে!*\n\n`
            + `💰 পরিমাণ: ${amount} ${method === 'usd' ? '$' : '৳'}\n`
            + `💳 মাধ্যম: ${method}\n`
            + `📝 নোট: ${note}`, { parse_mode: 'Markdown' });
});

// ==========================================
// 📜 HISTORY VIEWER
// ==========================================
const showHistory = async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const txs = user.transactions;
    
    if (txs.length === 0) return ctx.reply('📭 আপনার কোনো লেনদেনের হিস্ট্রি নেই।');

    const recentTxs = txs.slice(-10).reverse();
    let msg = `📜 *আপনার শেষ লেনদেনের হিস্ট্রি:*\n━━━━━━━━━━━━━━━━\n`;
    
    recentTxs.forEach((t) => {
        const icon = t.type === 'income' ? '🟢' : '🔴';
        const date = new Date(t.date).toLocaleDateString('en-GB');
        msg += `${icon} *${t.amount}* ${t.method === 'usd' ? '$' : '৳'} (${t.method}) \n📝 ${t.note} \n📅 ${date}\n\n`;
    });

    ctx.replyWithMarkdown(msg);
};

bot.action('show_history', showHistory);
bot.hears('📜 শেষ ১০টি হিস্ট্রি', showHistory);

// ==========================================
// 🏦 LOAN TRACKER
// ==========================================
bot.hears('🏦 লোন ট্র্যাকার', async (ctx) => {
    const user = await getUserData(ctx.from.id);
    const loans = user.loans;

    let msg = `🏦 *আপনার লোন ম্যানেজমেন্ট*\n━━━━━━━━━━━━━━━━\n`;

    if (loans.length === 0) {
        msg += `আপনার বর্তমানে কোনো লোন নেই।\n\n`;
    } else {
        loans.forEach((l) => {
            const progress = Math.round((l.paid / l.amount) * 10);
            const bar = '█'.repeat(progress) + '░'.repeat(10 - progress);
            const percentage = Math.round((l.paid / l.amount) * 100);

            msg += `🔹 *${l.name}*\n`
                +  `💰 মোট: ${l.amount} ৳ | শোধ হয়েছে: ${l.paid} ৳\n`
                +  `📊 প্রগ্রেস: [${bar}] ${percentage}%\n`
                +  `📅 কিস্তির দিন: প্রতি মাসের ${l.date} তারিখ\n\n`;
        });
    }

    msg += `➕ *নতুন লোন যুক্ত করতে নিচে কমান্ড দিন:*\n`
         + `\`/addloan [নাম] [মোট টাকা] [কত শোধ করেছেন] [কিস্তির তারিখ]\`\n\n`
         + `*উদাহরণ:* \`/addloan Bkash_Loan 5000 1000 15\``;

    ctx.replyWithMarkdown(msg);
});

bot.command('addloan', async (ctx) => {
    const args = ctx.message.text.split(' ');
    
    if (args.length < 5) {
        return ctx.reply('❌ সঠিক নিয়ম: `/addloan [নাম] [মোট টাকা] [কত শোধ করেছেন] [কিস্তির তারিখ]`', { parse_mode: 'Markdown' });
    }

    const user = await getUserData(ctx.from.id);
    
    user.loans.push({
        name: args[1],
        amount: parseInt(args[2]),
        paid: parseInt(args[3]),
        date: args[4]
    });

    await updateUserData(ctx.from.id, { loans: user.loans });
    ctx.reply(`✅ *${args[1]}* লোনটি সফলভাবে যুক্ত হয়েছে!`);
});

// ==========================================
// 🛠️ DIGITAL TOOLS (Short, Mail, Tags)
// ==========================================
bot.hears('🛠️ ডিজিটাল টুলস', (ctx) => {
    const msg = `🛠️ *আপনার ডিজিটাল মার্কেটিং টুলস:*\n\n`
              + `🔗 */short [লিংক]* - যেকোনো বড় লিংক শর্ট করতে।\n`
              + `📧 */mail* - নতুন টেম্পোরারি (ফেক) ইমেইল পেতে।\n`
              + `#️⃣ */tags [বিষয়]* - পোস্টের জন্য ভাইরাল হ্যাশট্যাগ পেতে।`;
    ctx.replyWithMarkdown(msg);
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
        try { 
            await bot.handleUpdate(req.body); 
            res.status(200).send('OK'); 
        } catch (error) { 
            res.status(500).send('Error'); 
        }
    } else { 
        res.status(200).send('Finance Bot Connected with Supabase!'); 
    }
};
