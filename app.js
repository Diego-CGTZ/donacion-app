// 🛠 Reemplaza con tus datos reales de Supabase:
const supabaseUrl = 'https://hppzbwbiogettgyeykid.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHpid2Jpb2dldHRneWV5a2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNjgzMjQsImV4cCI6MjA2MjY0NDMyNH0.MHrRm_8270nri7LNia_msEt369amW4h5p6oGAU5YBFs';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let map;
let marcadoresCentros = [];
let centrosGeojson = [];
let capaBuffer = null;

document.addEventListener('DOMContentLoaded', () => {
    map = L.map('map').setView([19.4326, -99.1332], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    cargarCentros();
    cargarZonas();
    cargarCampañas();

    // Reactivar los filtros al cambiar
    document.querySelectorAll('#sidebar select').forEach(select => {
        select.addEventListener('change', cargarCentros);
    });

    // Análisis con Turf.js
    document.getElementById('btn-buffer').addEventListener('click', () => {
        alert('Haz clic en el mapa para crear un buffer de 1 km');

        map.once('click', e => {
            const clickedPoint = turf.point([e.latlng.lng, e.latlng.lat]);
            const buffer = turf.buffer(clickedPoint, 1, { units: 'kilometers' });

            if (capaBuffer) map.removeLayer(capaBuffer);

            capaBuffer = L.geoJSON(buffer, {
                style: {
                    color: '#1d3557',
                    fillColor: '#a8dadc',
                    fillOpacity: 0.3
                }
            }).addTo(map);

            const dentro = centrosGeojson.filter(f => turf.booleanPointInPolygon(f, buffer));

            dentro.forEach(c => {
                L.circleMarker([c.geometry.coordinates[1], c.geometry.coordinates[0]], {
                    radius: 6,
                    color: '#457b9d',
                    fillColor: '#1d3557',
                    fillOpacity: 0.9
                }).addTo(map).bindPopup(`<b>${c.properties.nombre}</b><br>Está dentro del área de análisis.`);
            });

            alert(`Se encontraron ${dentro.length} centros dentro del radio de 1 km.`);
        });
    });
});

document.getElementById('btn-ruta').addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocalización no soportada por tu navegador.');
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const userCoords = [pos.coords.longitude, pos.coords.latitude];
    const userPoint = turf.point(userCoords);

    // Encontrar el centro más cercano
    let centroMasCercano = null;
    let distanciaMinima = Infinity;

    centrosGeojson.forEach(c => {
      const dist = turf.distance(userPoint, c, { units: 'kilometers' });
      if (dist < distanciaMinima) {
        distanciaMinima = dist;
        centroMasCercano = c;
      }
    });

    if (!centroMasCercano) {
      alert('No se encontraron centros en la base de datos.');
      return;
    }

    // Dibujar la línea
    const linea = turf.lineString([userCoords, centroMasCercano.geometry.coordinates]);
    L.geoJSON(linea, {
      color: 'blue',
      weight: 3,
      dashArray: '6, 4'
    }).addTo(map);

    // Marcar ubicación del usuario
    L.marker([userCoords[1], userCoords[0]])
      .addTo(map)
      .bindPopup('📍 Tu ubicación')
      .openPopup();

    alert(`Centro más cercano: ${centroMasCercano.properties.nombre}\nDistancia: ${distanciaMinima.toFixed(2)} km`);

  }, () => {
    alert('No se pudo obtener tu ubicación.');
  });
});


async function cargarCentros() {
    const { data, error } = await supabase.from('centros_salud').select('*');
    if (error) {
        console.error('Error al cargar centros:', error);
        return;
    }

    marcadoresCentros.forEach(m => map.removeLayer(m));
    marcadoresCentros = [];
    centrosGeojson = [];

    const tipoFiltro = document.getElementById('filtro-tipo').value;
    const disponibilidadFiltro = document.getElementById('filtro-disponible').value;
    const sangreFiltro = document.getElementById('filtro-sangre').value;

    data.forEach(c => {
        if (
            (tipoFiltro && c.tipo !== tipoFiltro) ||
            (disponibilidadFiltro && String(c.disponibilidad) !== disponibilidadFiltro) ||
            (sangreFiltro && !c.tipo_sangre_aceptada.includes(sangreFiltro))
        ) return;

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
                coordinates: coords
            }
        });
    });
}

async function cargarZonas() {
    const { data, error } = await supabase.from('zonas_cobertura').select('*');
    if (error) {
        console.error('Error al cargar zonas:', error);
        return;
    }

    data.forEach(z => {
        const coords = z.geom.coordinates[0].map(c => [c[1], c[0]]);
        const polygonGeoJSON = {
            type: 'Feature',
            geometry: z.geom,
            properties: { ...z }
        };

        const zonaBuffer = turf.buffer(polygonGeoJSON, 3, { units: 'kilometers' });


        const hayCentroCercano = centrosGeojson.some(c => {
            return turf.booleanPointInPolygon(c, zonaBuffer);
        });

        const color = hayCentroCercano
            ? (z.tipo === 'riesgo' ? 'red' : 'green')
            : '#6c757d'; // gris oscuro para sin cobertura

        const polygon = L.polygon(coords, {
            color,
            fillOpacity: 0.3,
            weight: 2
        }).addTo(map);

        polygon.bringToBack();

        polygon.bindPopup(`
      <b>${z.nombre}</b><br>
      Tipo: ${z.tipo}<br>
      Urgencia: ${z.nivel_urgencia}<br>
      Población: ${z.poblacion_estimada}<br>
      <b>${hayCentroCercano ? '✔️ Con cobertura' : '❌ Sin cobertura cercana (3 km)'}</b>
    `);
    });
}


async function cargarCampañas() {
    const { data, error } = await supabase.from('campañas_donacion').select('*, centros_salud(nombre)');
    if (error) {
        console.error('Error al cargar campañas:', error);
        return;
    }

    const iconoGota = L.icon({
        iconUrl: 'img/blood-drop.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    const hoy = new Date().toISOString().split('T')[0];
    const contenedor = document.getElementById('lista-campañas');
    contenedor.innerHTML = ''; // limpiar lista anterior

    data.forEach(c => {
        if (c.fecha_inicio > hoy || c.fecha_fin < hoy) return;

        const coords = c.geom.coordinates;
        const marker = L.marker([coords[1], coords[0]], { icon: iconoGota }).addTo(map);

        marker.bindPopup(`
      <b>🩸 ${c.titulo}</b><br>
      ${c.descripcion}<br><br>
      <b>Fechas:</b> ${c.fecha_inicio} a ${c.fecha_fin}<br>
      <b>Requisitos:</b> ${c.requisitos}<br>
      <b>Centro:</b> ${c.centros_salud?.nombre || 'Sin asignar'}
    `);

        // Agregar a la lista del panel
        const item = document.createElement('div');
        item.classList.add('campaña-item');
        item.innerHTML = `
      <b>${c.titulo}</b>
      Centro: ${c.centros_salud?.nombre || 'N/A'}<br>
      Fechas: ${c.fecha_inicio} → ${c.fecha_fin}
    `;
        contenedor.appendChild(item);
    });
}


