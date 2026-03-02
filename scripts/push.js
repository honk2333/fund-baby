
const fs = require('fs');
const path = require('path');

// 模拟 server-side fund fetching
async function fetchFundData(code) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fund.eastmoney.com/'
    };

    let gzData = {};
    try {
        const gzUrl = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
        const response = await fetch(gzUrl, { headers });
        const gzText = await response.text();
        if (gzText.includes('jsonpgz(')) {
            const match = gzText.match(/jsonpgz\((.*)\)/);
            if (match && match[1]) gzData = JSON.parse(match[1]);
        }
    } catch (e) {
        console.warn(`[Valuation Fetch Failed] ${code}: ${e.message}`);
    }

    let tData = {};
    try {
        const tUrl = `https://qt.gtimg.cn/q=jj${code}`;
        const response = await fetch(tUrl, { headers: { ...headers, 'Referer': 'https://gu.qq.com/' } });
        const tText = await response.text();
        const tMatch = tText.match(/v_jj\d+="(.*)"/);
        if (tMatch && tMatch[1]) {
            const p = tMatch[1].split('~');
            tData = { dwjz: p[5], zzl: parseFloat(p[7]), jzrq: p[8] ? p[8].slice(0, 10) : '' };
        }
    } catch (e) {
        console.warn(`[Quote Fetch Failed] ${code}: ${e.message}`);
    }

    if (!gzData.name && !tData.dwjz) return null;

    return {
        code,
        name: gzData.name || `基金(${code})`,
        dwjz: tData.dwjz || gzData.dwjz,
        gsz: gzData.gsz,
        gszzl: gzData.gszzl,
        gztime: gzData.gztime,
        jzrq: tData.jzrq || gzData.jzrq,
        zzl: tData.zzl !== undefined ? tData.zzl : null
    };
}

async function sendFeishu(webhookUrl, fundsData, title) {
    const getPercentageColor = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return "grey";
        return num > 0 ? "red" : (num < 0 ? "green" : "grey");
    };

    const elements = [];
    fundsData.forEach((f, index) => {
        const rate = f.zzl !== undefined ? f.zzl : (parseFloat(f.gszzl) || 0);
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
        if (index < fundsData.length - 1) elements.push({ "tag": "hr" });
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
                { "tag": "note", "elements": [{ "tag": "plain_text", "content": "Powered by scripts/push.js" }] }
            ]
        }
    };

    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return await res.json();
}

async function main() {
    const hook = process.env.FEISHU_HOOK_URL;
    let codesStr = process.env.FUND_CODES;
    const title = process.env.PUSH_TITLE || "基金估值定时推送";

    if (!hook) {
        console.error("Error: FEISHU_HOOK_URL is required");
        process.exit(1);
    }

    if (!codesStr) {
        const filePath = path.join(__dirname, '../app/data/my-funds.json');
        if (fs.existsSync(filePath)) {
            codesStr = JSON.parse(fs.readFileSync(filePath, 'utf8')).join(',');
        }
    }

    if (!codesStr) {
        console.error("Error: No fund codes found");
        process.exit(1);
    }

    const codes = codesStr.split(',');
    const results = [];
    for (const code of codes) {
        const data = await fetchFundData(code.trim());
        if (data) results.push(data);
    }

    if (results.length === 0) {
        console.error("Error: No data fetched for any codes");
        process.exit(1);
    }

    const res = await sendFeishu(hook, results, title);
    console.log("Feishu Response:", JSON.stringify(res));
}

main();
