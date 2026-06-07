const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

// এনভায়রনমেন্ট ভেরিয়েবল সেটআপ
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const staticDate = new Date().toLocaleDateString('en-GB');

    // Supabase-এ নতুন ইউজারের সেশন তৈরি বা আপডেট করা
    await supabase.from('bot_sessions').upsert({
        chat_id: chatId,
        step: 'WAITING_FOR_UID',
        static_date: staticDate,
        current_uid: null,
        data: []
    });

    ctx.reply('👋 স্বাগতম! ফেসবুক মার্কেটিং শিট তৈরি শুরু করা যাক।\n\n👉 প্রথমে Column A এর জন্য Facebook UID পেস্ট করো:');
});

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    // Supabase থেকে বর্তমান সেশন পড়া
    const { data: session, error } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('chat_id', chatId)
        .single();

    if (!session) return ctx.reply('অনুগ্রহ করে /start কমান্ড দিয়ে শুরু করো।');

    // ধাপ ১: UID গ্রহণ
    if (session.step === 'WAITING_FOR_UID') {
        await supabase.from('bot_sessions').update({
            step: 'WAITING_FOR_NAME',
            current_uid: text
        }).eq('chat_id', chatId);

        return ctx.reply('✅ UID সেভ হয়েছে।\n👉 এবার Column C এর জন্য Facebook Name লিখে পাঠাও:');
    }

    // ধাপ ২: Name গ্রহণ ও ডাটাবেসে Row সেভ
    if (session.step === 'WAITING_FOR_NAME') {
        const newRow = {
            'Facebook UID': session.current_uid,
            'Date': session.static_date,
            'Facebook Name': text
        };

        const newData = [...session.data, newRow]; // আগের ডাটার সাথে নতুনটি যোগ করা

        await supabase.from('bot_sessions').update({
            step: 'WAITING_FOR_UID',
            current_uid: null,
            data: newData
        }).eq('chat_id', chatId);

        return ctx.reply(
            `📊 Row ${newData.length} সেভ হয়েছে!\n\n👉 পরবর্তী Row এর জন্য আবার Facebook UID পেস্ট করো। অথবা শেষ করতে নিচে বাটনে চাপো:`,
            Markup.inlineKeyboard([
                Markup.button.callback('💾 Save & Export XLSX', 'export_xlsx')
            ])
        );
    }
});

bot.action('export_xlsx', async (ctx) => {
    const chatId = ctx.chat.id;

    // ডাটাবেস থেকে সব ডাটা নিয়ে আসা
    const { data: session } = await supabase
        .from('bot_sessions')
        .select('data')
        .eq('chat_id', chatId)
        .single();

    if (!session || !session.data || session.data.length === 0) {
        return ctx.reply('কোনো ডাটা পাওয়া যায়নি!');
    }

    await ctx.reply('⏳ ফাইল তৈরি হচ্ছে, অনুগ্রহ করে অপেক্ষা করো...');

    try {
        const worksheet = xlsx.utils.json_to_sheet(session.data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'FB_Data');

        // Serverless-এ ফাইল রাইট করা যায় না, তাই Buffer ব্যবহার করা হচ্ছে
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Telegram-এ ডকুমেন্ট হিসেবে পাঠানো
        await ctx.replyWithDocument({
            source: buffer,
            filename: `FB_Report_${Date.now()}.xlsx`
        });

        // মেমোরি ক্লিয়ার করা
        await supabase.from('bot_sessions').delete().eq('chat_id', chatId);

        ctx.reply('🎉 সফলভাবে আপনার .xlsx ফাইলটি পাঠানো হয়েছে। নতুন শিট করতে /start চাপো।');
    } catch (error) {
        console.error(error);
        ctx.reply('❌ ফাইল তৈরিতে সমস্যা হয়েছে।');
    }
});

// Vercel Serverless Function-এর মূল হ্যান্ডলার
export default async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } catch (error) {
            console.error('Error handling update:', error);
            res.status(500).send('Something went wrong.');
        }
    } else {
        res.status(200).send('Telegram Bot Webhook is running!');
    }
}
