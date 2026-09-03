'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) setOrders(data);
      setLoading(false);
    }
    loadOrders();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex justify-between items-center border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">COD MANAGER</h1>
          <p className="text-xs text-zinc-400">Control operativo y financiero</p>
        </div>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-semibold">
          Webhook Activo
        </span>
      </header>

      <main className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 mb-4">
          Bandeja de Pedidos ({orders.length})
        </h2>

        {loading ? (
          <p className="text-zinc-500 text-sm">Conectando con la base de datos...</p>
        ) : orders.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 text-sm space-y-2">
            <p>Aún no hay pedidos registrados.</p>
            <p className="text-xs text-zinc-600">
              Aparecerán aquí automáticamente en cuanto caiga una compra en Shopify.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center bg-zinc-950 border border-zinc-800 p-4 rounded-xl"
              >
                <div>
                  <p className="font-bold text-white text-sm">
                    {order.order_number} - {order.customer_name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {order.city} • Zona: <span className="uppercase text-emerald-400 font-semibold">{order.zone}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-white">S/ {Number(order.total_amount).toFixed(2)}</p>
                  <span className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full uppercase font-medium">
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
