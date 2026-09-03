import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// Diccionario de distritos y abreviaturas de Lima y Callao
const LIMA_DISTRICTS = [
  'lima', 'callao', 'sjl', 'san juan de lurigancho', 'smp', 'san martin de porres',
  'ves', 'villa el salvador', 'vmt', 'villa maria del triunfo', 'ate', 'vitarte',
  'comas', 'los olivos', 'surco', 'santiago de surco', 'miraflores', 'san borja',
  'la molina', 'independencia', 'san miguel', 'pueblo libre', 'magdalena',
  'jesus maria', 'lince', 'brena', 'breña', 'rimac', 'chorrillos', 'bellavista',
  'la perla', 'carmen de la legua', 'ventanilla', 'santa anita', 'puente piedra',
  'carabayllo', 'lurin', 'pachacamac', 'san luis', 'la victoria', 'el agustino',
  'barranco', 'surquillo', 'santa rosa', 'ancón', 'ancon', 'chaclacayo', 'chosica', 'cieneguilla'
];

export async function GET() {
  const { count, error } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  if (error) return NextResponse.json({ estado: 'Error en Supabase', detalle: error.message }, { status: 500 });
  return NextResponse.json({ estado: 'Conexión exitosa con Supabase', total_pedidos: count });
}

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

    const phone = shipping.phone || billing.phone || customer.phone || body.phone || 'Sin teléfono';
    const city = shipping.city || billing.city || shipping.province || billing.province || 'Lima';
    const address = shipping.address1 || billing.address1 || 'Entrega coordinada';

    // Detección inteligente de zona (Lima vs Provincia)
    const textToCheck = `${city} ${address}`.toLowerCase();
    const isLima = LIMA_DISTRICTS.some((district) => textToCheck.includes(district));
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

    const orderData = {
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
    };

    const { data: existing } = await supabase.from('orders').select('id').eq('shopify_order_id', orderId).maybeSingle();

    let dbError = null;
    if (existing) {
      const { error } = await supabase.from('orders').update(orderData).eq('shopify_order_id', orderId);
      dbError = error;
    } else {
      const { error } = await supabase.from('orders').insert([orderData]);
      dbError = error;
    }

    if (dbError) {
      console.error('Error al guardar en Supabase:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: orderNumber }, { status: 200 });
  } catch (err) {
    console.error('Error webhook:', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
