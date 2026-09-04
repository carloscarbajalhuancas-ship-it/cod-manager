import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { sheetUrl, orderData } = body;

    if (!sheetUrl) {
      return NextResponse.json({ error: 'Falta la URL de Google Sheets' }, { status: 400 });
    }

    // El servidor de Next.js envía la data a Google Sheets sin bloqueos de navegador
    const response = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    });

    const textRes = await response.text();
    return NextResponse.json({ ok: true, detail: textRes });
  } catch (err) {
    console.error('Error puente Google Sheets:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
