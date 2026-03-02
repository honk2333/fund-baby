
export const sendFeishuMessage = async (webhookUrl, fundsData, title = "Fund Valuation Report") => {
    if (!webhookUrl || !fundsData || fundsData.length === 0) return;

    const getPercentageColor = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return "grey";
        if (num > 0) return "red";
        if (num < 0) return "green";
        return "grey";
    };

    const elements = [];
    fundsData.forEach((f, index) => {
        const rate = f.zzl !== undefined ? f.zzl : (parseFloat(f.gszzl) || 0);
        const color = getPercentageColor(rate);
        const ratingStr = rate > 0 ? `+${rate.toFixed(2)}%` : `${rate.toFixed(2)}%`;
        const navVal = f.gsz || f.dwjz || '---';
        const dateStr = f.gztime || f.jzrq || '---';

        elements.push({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": `**${f.name}** (${f.code})\n**估值:** \`${navVal}\` | **涨跌幅:** **${ratingStr}**\n**时间:** ${dateStr}`
            }
        });

        if (index < fundsData.length - 1) {
            elements.push({ "tag": "hr" });
        }
    });

    const body = {
        "msg_type": "interactive",
        "card": {
            "config": { "wide_screen_mode": true },
            "header": {
                "title": { "tag": "plain_text", "content": `📈 ${title}` },
                "template": "blue"
            },
            "elements": [
                ...elements,
                { "tag": "hr" },
                {
                    "tag": "note",
                    "elements": [{ "tag": "plain_text", "content": "Powered by Fund Baby (养基小宝)" }]
                }
            ]
        }
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error("Feishu Push Error:", error);
        return { ok: false, error: error.message };
    }
};
