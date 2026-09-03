import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function POST(req) {
  try {
    const body = await req.json();

    const orderId = String(body.id);
    const orderNumber = body.name || `#${body.order_number}`;

    const shipping = body.shipping_address || {};
    const customer = body.customer || {};

    const customerName = `${shipping.first_name || customer.first_name || 'Cliente'} ${
      shipping.last_name || customer.last_name || ''
    }`.trim();

    const phone = shipping.phone || customer.phone || body.phone || '';
    const city = shipping.city || shipping.province || '';
    const address = shipping.address1 || '';

    // Detección automática: Lima vs Provincia
    const cityNormalized = city.toLowerCase();
    const isLima = cityNormalized.includes('lima') || cityNormalized.includes('callao');
    const zone = isLima ? 'lima' : 'provincia';
    const deliveryType = isLima ? 'domicilio' : 'agencia';

    // Extracción de DNI desde notas o campos adicionales del formulario COD
    let dni = '';
    if (body.note_attributes && Array.isArray(body.note_attributes)) {
      const dniField = body.note_attributes.find(
        (attr) =>
          attr.name?.toLowerCase().includes('dni') ||
          attr.name?.toLowerCase().includes('documento')
      );
      if (dniField) dni = dniField.value;
    }

    const totalAmount = parseFloat(body.total_price || 0);
    const orderHour = new Date(body.created_at || Date.now()).getHours();

    const items = (body.line_items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku || '',
      variant: item.variant_title || '',
    }));

    // Guardar en Supabase (evita duplicados con upsert)
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
      console.error('Error en base de datos:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order: orderNumber }, { status: 200 });
  } catch (err) {
    console.error('Error procesando webhook:', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
