// Reemplaza con tus claves
const supabaseUrl = 'https://hppzbwbiogettgyeykid.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHpid2Jpb2dldHRneWV5a2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNjgzMjQsImV4cCI6MjA2MjY0NDMyNH0.MHrRm_8270nri7LNia_msEt369amW4h5p6oGAU5YBFs';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let marcadoresCentros = []; // Para borrar cuando se actualicen filtros
let capaBuffer = null;
let centrosGeojson = []; // guardamos todos los centros como GeoJSON



document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([19.4326, -99.1332], 12);

    // Mapa base
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    async function cargarCentros() {
        const { data, error } = await supabase.from('centros_salud').select('*');
        if (error) {
            console.error('Error al cargar centros:', error);
            return;
        }

        // Limpiar marcadores anteriores
        marcadoresCentros.forEach(m => map.removeLayer(m));
        marcadoresCentros = [];

        // Leer filtros
        const tipoFiltro = document.getElementById('filtro-tipo').value;
        const disponibilidadFiltro = document.getElementById('filtro-disponible').value;
        const sangreFiltro = document.getElementById('filtro-sangre').value;

        data.forEach(c => {
            if (
                (tipoFiltro && c.tipo !== tipoFiltro) ||
                (disponibilidadFiltro && String(c.disponibilidad) !== disponibilidadFiltro) ||
                (sangreFiltro && !c.tipo_sangre_aceptada.includes(sangreFiltro))
            ) {
                return; // no cumple los filtros
            }

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
            marcadoresCentros.push(marker);

            centrosGeojson.push({
                type: 'Feature',
                properties: { ...c },
                geometry: {
                    type: 'Point',
                    coordinates: c.geom.coordinates
                }
            });

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

    // Icono Gota
    const iconoGota = L.icon({
        iconUrl: 'img/blood-drop.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    async function cargarCampañas() {
        const { data, error } = await supabase.from('campañas_donacion').select('*, centros_salud(nombre)');
        if (error) {
            console.error('Error al cargar campañas:', error);
            return;
        }

        data.forEach(campaña => {
            const coords = campaña.geom.coordinates;
            const marker = L.marker([coords[1], coords[0]], { icon: iconoGota }).addTo(map);

            marker.bindPopup(`
      <b>🩸 ${campaña.titulo}</b><br>
      ${campaña.descripcion}<br><br>
      <b>Fechas:</b> ${campaña.fecha_inicio} a ${campaña.fecha_fin}<br>
      <b>Requisitos:</b> ${campaña.requisitos}<br>
      <b>Centro:</b> ${campaña.centros_salud?.nombre || 'Sin asignar'}
    `);
        });
    }


    cargarCentros();
    cargarCampañas();
    cargarZonas();

    // Actualizar al cambiar filtros
    document.querySelectorAll('#filtros select').forEach(select => {
        select.addEventListener('change', cargarCentros);
    });

    document.getElementById('btn-buffer').addEventListener('click', () => {
        alert('Haz clic en un centro de salud para ver los centros cercanos (1 km).');

        // Esperamos al siguiente clic del usuario
        map.once('click', e => {
            const clickedPoint = turf.point([e.latlng.lng, e.latlng.lat]);

            // Creamos buffer de 1 km
            const buffer = turf.buffer(clickedPoint, 1, { units: 'kilometers' });

            // Quitamos buffer anterior si existía
            if (capaBuffer) {
                map.removeLayer(capaBuffer);
            }

            // Dibujamos el buffer
            capaBuffer = L.geoJSON(buffer, {
                style: {
                    color: '#1d3557',
                    fillColor: '#a8dadc',
                    fillOpacity: 0.3
                }
            }).addTo(map);

            // Buscar centros dentro del buffer
            const dentro = centrosGeojson.filter(f => turf.booleanPointInPolygon(f, buffer));

            dentro.forEach(c => {
                L.circleMarker([c.geometry.coordinates[1], c.geometry.coordinates[0]], {
                    radius: 6,
                    color: '#457b9d',
                    fillColor: '#1d3557',
                    fillOpacity: 0.9
                }).addTo(map)
                    .bindPopup(`<b>${c.properties.nombre}</b><br>Está dentro del área de análisis.`);
            });

            alert(`Se encontraron ${dentro.length} centros dentro del radio de 1 km.`);
        });
    });

});

