// Reemplaza con tus claves
const supabaseUrl = 'https://hppzbwbiogettgyeykid.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHpid2Jpb2dldHRneWV5a2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNjgzMjQsImV4cCI6MjA2MjY0NDMyNH0.MHrRm_8270nri7LNia_msEt369amW4h5p6oGAU5YBFs';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map').setView([19.4326, -99.1332], 12);

  // Mapa base
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Cargar centros de salud
  async function cargarCentros() {
    const { data, error } = await supabase.from('centros_salud').select('*');
    if (error) {
      console.error('Error al cargar centros:', error);
      return;
    }

    data.forEach(c => {
      const coords = c.geom.coordinates;
      const marker = L.marker([coords[1], coords[0]]).addTo(map);
      marker.bindPopup(`
        <b>${c.nombre}</b><br>
        Tipo: ${c.tipo}<br>
        Capacidad donación: ${c.capacidad_donacion}<br>
        Capacidad transfusión: ${c.capacidad_transfusion}<br>
        Horario: ${c.horario}<br>
        Sangre aceptada: ${c.tipo_sangre_aceptada.join(', ')}
      `);
    });
  }

  // Cargar zonas
  async function cargarZonas() {
    const { data, error } = await supabase.from('zonas_cobertura').select('*');
    if (error) {
      console.error('Error al cargar zonas:', error);
      return;
    }

    data.forEach(z => {
      const coords = z.geom.coordinates[0].map(c => [c[1], c[0]]);
      const color = z.tipo === 'riesgo' ? 'red' : 'green';

      const polygon = L.polygon(coords, {
        color,
        fillOpacity: 0.3,
        weight: 2
      }).addTo(map);

      polygon.bindPopup(`
        <b>${z.nombre}</b><br>
        Tipo: ${z.tipo}<br>
        Urgencia: ${z.nivel_urgencia}<br>
        Población: ${z.poblacion_estimada}
      `);
    });
  }

  cargarCentros();
  cargarZonas();
});