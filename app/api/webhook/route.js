import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// Prueba de conexión directa desde el navegador
export async function GET() {
  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ estado: 'Error en Supabase', detalle: error.message }, { status: 500 });
  }
  return NextResponse.json({ estado: 'Conexión exitosa con Supabase', total_pedidos: count });
}

// Receptor del webhook de pedidos de Shopify
export async function POST(req) {
  try {
    const body = await req.json();

    const orderId = String(body.id || Date.now());
    const orderNumber = body.name || `#${body.order_number || 'S/N'}`;

    const shipping = body.shipping_address || {};
    const billing = body.billing_address || {};
    const customer = body.customer || {};

    const customerName = (
      `${shipping.first_name || billing.first_name || customer.first_name || 'Cliente'} ` +
      `${shipping.last_name || billing.last_name || customer.last_name || ''}`
    ).trim();

    const phone =
      shipping.phone ||
      billing.phone ||
      customer.phone ||
      body.phone ||
      'Sin teléfono';

    const city =
      shipping.city ||
      billing.city ||
      shipping.province ||
      billing.province ||
      'Lima';

    const address =
      shipping.address1 ||
      billing.address1 ||
      'Entrega coordinada';

    const cityNormalized = city.toLowerCase();
    const isLima =
      cityNormalized.includes('lima') || cityNormalized.includes('callao');
    const zone = isLima ? 'lima' : 'provincia';
    const deliveryType = isLima ? 'domicilio' : 'agencia';

    let dni = '';
    if (body.note_attributes && Array.isArray(body.note_attributes)) {
      const dniField = body.note_attributes.find((attr) => {
        const key = (attr.name || '').toLowerCase();
        return key.includes('dni') || key.includes('documento') || key.includes('cedula');
      });
      if (dniField) dni = String(dniField.value);
    }

    const totalAmount = parseFloat(body.total_price || body.current_total_price || 0);
    const orderHour = new Date(body.created_at || Date.now()).getHours();

    const items = (body.line_items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku || '',
      variant: item.variant_title || '',
    }));

    const { error } = await supabase.from('orders').upsert(
      {
        shopify_order_id: orderId,
        order_number: orderNumber,
        customer_name: customerName,
        customer_dni: dni || null,
        phone: phone,
        city: city,
        address: address,
        zone: zone,
        delivery_type: deliveryType,
        courier: zone === 'lima' ? 'motorizado' : 'shalom',
        total_amount: totalAmount,
        advance_payment: 0.00,
        status: 'pendiente',
        items: items,
        order_hour: orderHour,
      },
      { onConflict: 'shopify_order_id' }
    );

    if (error) {
      console.error('Error en Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: orderNumber }, { status: 200 });
  } catch (err) {
    console.error('Error webhook:', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
