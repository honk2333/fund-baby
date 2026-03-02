import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'app/data/my-funds.json');
        if (!fs.existsSync(filePath)) {
            return NextResponse.json([]);
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const codes = JSON.parse(fileContent);
        return NextResponse.json(codes);
    } catch (error) {
        console.error('Failed to read funds config:', error);
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}
