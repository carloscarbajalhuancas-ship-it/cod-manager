'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [orders, setOrders] = useState([]);
  const [filterZone, setFilterZone] = useState('todos');
  const [loading, setLoading] = useState(true);

  // Cargar pedidos desde Supabase
  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    // Actualización en tiempo real cuando entra una venta
    const channel = supabase
      .channel('realtime_orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Cambiar estado del pedido
  const updateStatus = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    fetchOrders();
  };

  const filteredOrders = orders.filter((o) => {
    if (filterZone === 'todos') return true;
    return o.zone === filterZone;
  });

  // Métricas rápidas
  const totalRecaudado = orders
    .filter((o) => o.status !== 'cancelado')
    .reduce((acc, curr) => acc + (parseFloat(curr.total_amount) || 0), 0);

  const pendientesCount = orders.filter((o) => o.status === 'pendiente').length;

  return (
    <main className="min-h-screen bg-[#0d0f12] text-zinc-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Cabecera & Métricas Operativas */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-white">COD MANAGER</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Webhook Activo
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">Control operativo de despachos y flujo de caja contraentrega</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-xl">
              <span className="text-xs text-zinc-500 block uppercase font-bold tracking-wider">Pendientes</span>
              <span className="text-xl font-bold text-amber-400">{pendientesCount}</span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 px-4 py-2.5 rounded-xl">
              <span className="text-xs text-zinc-500 block uppercase font-bold tracking-wider">Monto Total</span>
              <span className="text-xl font-bold text-emerald-400">S/ {totalRecaudado.toFixed(2)}</span>
            </div>
          </div>
        </header>

        {/* Filtros */}
        <div className="flex items-center gap-2">
          {['todos', 'lima', 'provincia'].map((zone) => (
            <button
              key={zone}
              onClick={() => setFilterZone(zone)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg uppercase tracking-wider transition ${
                filterZone === zone
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              {zone} ({orders.filter((o) => (zone === 'todos' ? true : o.zone === zone)).length})
            </button>
          ))}
        </div>

        {/* Listado de Pedidos */}
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando despachos...</p>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl">
            <p className="text-zinc-500 text-sm">No hay pedidos registrados en esta sección.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const cleanPhone = (order.phone || '').replace(/\D/g, '');
              const msg = encodeURIComponent(
                `Hola ${order.customer_name}, te saludamos de la tienda para coordinar el envío de tu pedido ${order.order_number} por S/ ${order.total_amount}. ¿Confirmamos la dirección: ${order.address}, ${order.city}?`
              );
              const waUrl = `https://wa.me/51${cleanPhone}?text=${msg}`;

              return (
                <div
                  key={order.id || order.shopify_order_id}
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 flex flex-col justify-between hover:border-zinc-700 transition space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                        {order.order_number}
                      </span>
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          order.zone === 'lima'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        }`}
                      >
                        {order.zone} • {order.courier || (order.zone === 'lima' ? 'motorizado' : 'shalom')}
                      </span>
                    </div>

                    <div>
                      <h2 className="font-bold text-white text-base leading-snug">{order.customer_name}</h2>
                      <p className="text-xs text-zinc-400">{order.phone}</p>
                    </div>

                    <div className="bg-zinc-950/60 p-2.5 rounded-lg text-xs space-y-1 text-zinc-400 border border-zinc-900">
                      <p><span className="text-zinc-500">Destino:</span> {order.city}</p>
                      <p className="truncate"><span className="text-zinc-500">Dirección:</span> {order.address}</p>
                      {order.customer_dni && (
                        <p><span className="text-zinc-500">DNI:</span> {order.customer_dni}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-zinc-800/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Total a Cobrar</span>
                      <span className="text-lg font-black text-emerald-400">
                        S/ {parseFloat(order.total_amount || 0).toFixed(2)}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
                      >
                        WhatsApp
                      </a>
                      <select
                        value={order.status || 'pendiente'}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="en_ruta">En ruta</option>
                        <option value="entregado">Entregado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
