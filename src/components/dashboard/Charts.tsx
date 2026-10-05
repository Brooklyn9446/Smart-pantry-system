import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { climateHistory } from '../../data/dashboardMockData'
import { useInventory } from '../../context/useInventory'
import { PanelState } from '../ui/PanelState'

const tooltipStyle = { background: '#17231f', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12 }

export function QuantityChart() {
  const { items } = useInventory()
  return <section className="chart-card" aria-labelledby="quantity-title">
    <div className="card-heading"><div><h2 id="quantity-title">Quantity history</h2><p>{items[0] ? `${items[0].name} · Load cell pending` : 'Assign an item to begin'}</p></div></div>
    <PanelState kind="empty" message={items[0] ? `Initial quantity: ${items[0].initialQuantity} ${items[0].quantityUnit} (manual entry). Sensor history will appear after the ESP32 and HX711 are connected.` : 'No item is assigned to container-01 yet.'} />
  </section>
}

export function ClimateChart() {
  if (!climateHistory.length) return <PanelState kind="empty" message="No climate readings yet." />
  return <section className="chart-card" aria-labelledby="climate-title">
    <div className="card-heading"><div><h2 id="climate-title">Pantry conditions</h2><p>Today · Sensor readings</p></div><span className="live-label"><i /> Live</span></div>
    <div className="chart-wrap" role="img" aria-label="Line chart showing pantry temperature and humidity readings throughout today">
      <ResponsiveContainer width="100%" height="100%"><LineChart data={climateHistory} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#e8eee9" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#6b7c73', fontSize: 12 }} /><YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: '#6b7c73', fontSize: 12 }} domain={[20, 26]} unit="°" /><YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: '#6b7c73', fontSize: 12 }} domain={[45, 65]} unit="%" /><Tooltip contentStyle={tooltipStyle} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /><Line yAxisId="left" type="monotone" dataKey="temperature" name="Temperature" stroke="#e77c48" strokeWidth={2.5} dot={false} /><Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity" stroke="#3f93b1" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
    </div>
  </section>
}
