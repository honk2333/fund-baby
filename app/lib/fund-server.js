
const TZ_OFFSET = 8 * 60; // Asia/Shanghai

const getNowInTz = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
};

export const fetchServerFundData = async (code) => {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://fund.eastmoney.com/'
    };

    let gzData = {};
    try {
        // 1. Fetch from fundgz.1234567.com.cn (天天基金估值)
        const gzUrl = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
        // Set a 5s timeout to avoid hanging
        const gzRes = await fetch(gzUrl, {
            headers,
            signal: AbortSignal.timeout(5000)
        });
        const gzText = await gzRes.text();

        if (gzText.includes('jsonpgz(')) {
            const match = gzText.match(/jsonpgz\((.*)\)/);
            if (match && match[1]) {
                gzData = JSON.parse(match[1]);
            }
        }
    } catch (e) {
        console.warn(`[Feishu Push] Valuation fetch failed for ${code}: ${e.message}`);
    }

    let tData = {};
    try {
        // 2. Fetch from qt.gtimg.cn (腾讯财经行情)
        const tUrl = `https://qt.gtimg.cn/q=jj${code}`;
        const tRes = await fetch(tUrl, {
            headers: { ...headers, 'Referer': 'https://gu.qq.com/' },
            signal: AbortSignal.timeout(5000)
        });
        const tText = await tRes.text();

        const tMatch = tText.match(/v_jj\d+="(.*)"/);
        if (tMatch && tMatch[1]) {
            const p = tMatch[1].split('~');
            tData = {
                dwjz: p[5],
                zzl: parseFloat(p[7]),
                jzrq: p[8] ? p[8].slice(0, 10) : ''
            };
        }
    } catch (e) {
        console.warn(`[Feishu Push] Quote fetch failed for ${code}: ${e.message}`);
    }

    // If both failed, return null
    if (!gzData.name && !tData.dwjz) {
        return null;
    }

    // Merge data, priority to tData for established NAV
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
};
