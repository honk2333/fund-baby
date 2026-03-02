
import { NextResponse } from 'next/server';
import { fetchServerFundData } from '../../lib/fund-server';
import { sendFeishuMessage } from '../../lib/feishu';
import fs from 'fs';
import path from 'path';

const getFileCodes = () => {
    try {
        const filePath = path.join(process.cwd(), 'app/data/my-funds.json');
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('Failed to read funds from file', e);
    }
    return [];
};
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const codes = searchParams.get('codes');
    const hook = searchParams.get('hook');
    const title = searchParams.get('title') || '基金估值推送';

    let codeList = [];
    if (codes) {
        codeList = codes.split(',');
    } else {
        codeList = getFileCodes();
    }

    if (codeList.length === 0) {
        return NextResponse.json({ ok: false, message: "Missing fund codes and no default file config found" }, { status: 400 });
    }

    if (!hook) {
        return NextResponse.json({ ok: false, message: "Missing Feishu hook URL" }, { status: 400 });
    }

    const results = [];

    for (const code of codeList) {
        const data = await fetchServerFundData(code);
        if (data) {
            results.push(data);
        }
    }

    if (results.length === 0) {
        return NextResponse.json({ ok: false, message: "No data found for the provided codes" }, { status: 404 });
    }

    const feishuRes = await sendFeishuMessage(hook, results, title);
    console.log('[Feishu API Response (GET)]', JSON.stringify(feishuRes));

    // Feishu Webhooks usually return StatusCode: 0 or code: 0 for success
    const isOk = feishuRes && (feishuRes.StatusCode === 0 || feishuRes.code === 0 || feishuRes.status_code === 0);
    return NextResponse.json({ ok: isOk, feishuResponse: feishuRes });
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { codes, hook, title = '基金估值推送' } = body;

        if (!hook) {
            return NextResponse.json({ ok: false, message: "Missing Feishu hook URL" }, { status: 400 });
        }

        let codeList = [];
        if (codes) {
            codeList = Array.isArray(codes) ? codes : codes.split(',');
        } else {
            codeList = getFileCodes();
        }

        if (codeList.length === 0) {
            return NextResponse.json({ ok: false, message: "No fund codes provided" }, { status: 400 });
        }

        const results = [];

        for (const code of codeList) {
            const data = await fetchServerFundData(code);
            if (data) {
                results.push(data);
            }
        }

        if (results.length === 0) {
            return NextResponse.json({ ok: false, message: "No data found" }, { status: 404 });
        }

        const feishuRes = await sendFeishuMessage(hook, results, title);
        console.log('[Feishu API Response (POST)]', JSON.stringify(feishuRes));

        const isOk = feishuRes && (feishuRes.StatusCode === 0 || feishuRes.code === 0 || feishuRes.status_code === 0);
        return NextResponse.json({ ok: isOk, feishuResponse: feishuRes });
    } catch (error) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }
}
