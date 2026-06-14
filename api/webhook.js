const { Telegraf } = require('telegraf');

// আপনার বটের টোকেন
const BOT_TOKEN = '8739819887:AAEK41gSTtlIhp6Cf2vOo8qgAILxMrVAzLk';
const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// 🔥 START COMMAND 🔥
// ==========================================
bot.command('start', (ctx) => {
    const msg = `🌟 *স্বাগতম আপনার পার্সোনাল অনলাইন অ্যাসিস্ট্যান্ট বটে!* 🌟\n\n`
              + `আপনার ডিজিটাল মার্কেটিং এবং অনলাইনের কাজ সহজ করতে নিচের কমান্ডগুলো ব্যবহার করুন:\n\n`
              + `🔗 */short [লিংক]* - যেকোনো বড় লিংক শর্ট করতে।\n`
              + `📧 */mail* - নতুন টেম্পোরারি (ফেক) ইমেইল পেতে।\n`
              + `#️⃣ */tags [বিষয়]* - পোস্টের জন্য ভাইরাল হ্যাশট্যাগ পেতে।\n\n`
              + `*উদাহরণ:* /short https://facebook.com/my-very-long-post-link`;
    ctx.replyWithMarkdown(msg);
});

// ==========================================
// 1️⃣ LINK SHORTENER (TinyURL)
// ==========================================
bot.command('short', async (ctx) => {
    const text = ctx.message.text.split(' ');
    if (text.length < 2) {
        return ctx.reply('❌ *সঠিক নিয়ম:* `/short আপনার_বড়_লিংক`', { parse_mode: 'Markdown' });
    }
    
    const longUrl = text[1];
    const waitMsg = await ctx.reply('⏳ লিংক শর্ট করা হচ্ছে...');

    try {
        const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
        if (!res.ok) throw new Error('API Error');
        const shortUrl = await res.text();
        
        await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
        ctx.reply(`✅ *আপনার শর্ট লিংক তৈরি!*\n\n🔗 ${shortUrl}`, { parse_mode: 'Markdown' });
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
        ctx.reply('❌ লিংক শর্ট করতে সমস্যা হয়েছে। লিংকটি সঠিক কিনা চেক করুন।');
    }
});

// ==========================================
// 2️⃣ TEMP MAIL GENERATOR (1SecMail)
// ==========================================
bot.command('mail', async (ctx) => {
    const waitMsg = await ctx.reply('⏳ ইমেইল জেনারেট করা হচ্ছে...');

    try {
        const res = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        const data = await res.json();
        const email = data[0];
        const [login, domain] = email.split('@');
        
        const inboxUrl = `https://www.1secmail.com/mailbox/?email=${login}&domain=${domain}`;
        
        await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
        ctx.reply(
            `📧 *আপনার টেম্পোরারি ইমেইল রেডি!*\n\n` +
            `👉 \`${email}\`\n\n` +
            `📥 *ইনবক্স (OTP/Code) চেক করতে নিচের লিংকে ক্লিক করুন:*\n${inboxUrl}`, 
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
    } catch (error) {
        await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
        ctx.reply('❌ ইমেইল তৈরি করতে সার্ভারে সমস্যা হচ্ছে। একটু পর আবার চেষ্টা করুন।');
    }
});

// ==========================================
// 3️⃣ HASHTAG GENERATOR
// ==========================================
bot.command('tags', (ctx) => {
    const keyword = ctx.message.text.replace('/tags', '').trim();
    
    if (!keyword) {
        return ctx.reply('❌ *সঠিক নিয়ম:* `/tags আপনার_বিষয়` (যেমন: `/tags fashion`)', { parse_mode: 'Markdown' });
    }

    const cleanWord = keyword.replace(/\s+/g, '');
    const tags = `#${cleanWord} #${cleanWord}lovers #${cleanWord}style #${cleanWord}marketing #viral #trending #foryou #fyp #onlinebusiness #marketingstrategy`;
    
    ctx.reply(`🔥 *আপনার পোস্টের জন্য ভাইরাল হ্যাশট্যাগ:*\n\n\`${tags}\`\n\n(কপি করতে লেখার ওপর ক্লিক করুন)`, { parse_mode: 'Markdown' });
});

// ==========================================
// 🔥 VERCEL SERVER HANDLER 🔥
// ==========================================
module.exports = async function handler(req, res) {
    if (req.method === 'POST') {
        try { 
            await bot.handleUpdate(req.body); 
            res.status(200).send('OK'); 
        } 
        catch (error) { 
            res.status(500).send('Error'); 
        }
    } else { 
        res.status(200).send('Marketing Utility Bot Live!'); 
    }
};
