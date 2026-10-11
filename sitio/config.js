/* Datos del negocio. Para cambiar teléfono, horarios o redes, se edita solo este archivo. */
window.SITE = {
  nombre: 'CristalAuto Parabrisas',
  whatsapp: '595984102671',          // formato internacional, sin + ni espacios
  telefonoVisible: '0984 102 671',
  telefonoLink: '+595984102671',
  direccion: 'Calle Nicanor Ríos, San Lorenzo, Paraguay',
  mapaEnlace: 'https://maps.app.goo.gl/JNM4VwWQ8xu85ftQ7?g_st=ic',   // abre la ubicación exacta en Google Maps
  mapaQuery: 'Nicanor Ríos, San Lorenzo, Paraguay',
  // días: 0=domingo ... 6=sábado; horas en minutos desde las 00:00
  horarios: {
    1: [450, 1050], 2: [450, 1050], 3: [450, 1050], 4: [450, 1050], 5: [450, 1050], // lun-vie 7:30-17:30
    6: [450, 750],                                                                   // sáb 7:30-12:30
  },
  // Pegá acá los links y aparecen solos en la página. Dejá '' para ocultar.
  // Fotos reales (se muestran solas cuando las completes). Subilas a sitio/img/ y poné el nombre.
  fotos: { hero: '' },            // ej: 'img/local.jpg'  (foto grande de la portada)
  galeria: [],                    // ej: [{ src: 'img/trabajo1.jpg', alt: 'Cambio de parabrisas' }]
  // Reseñas de Google Maps. Solo opiniones REALES (no inventar). La sección aparece sola cuando hay al menos una.
  google: {
    enlace: 'https://maps.app.goo.gl/JNM4VwWQ8xu85ftQ7?g_st=ic',          // link de CristalAuto en Google Maps (para el botón "Ver todas las reseñas")
    calificacion: 4.8,  // ej: 4.8   (la que muestra Google)
    total: 39,         // ej: 57    (cantidad total de reseñas en Google)
  },
  resenas: [
    { nombre: 'Enrique S.', estrellas: 5, texto: 'Excelente atención, muy profesionales. Los recomiendo.' },
    { nombre: 'Miki M.', estrellas: 5, texto: 'Atención 10/10, excelente servicio, altamente recomendable.' },
    { nombre: 'Marcos C.', estrellas: 5, texto: 'Atención personalizada, trabajo excelente y profesional en quitar rayado del parabrisas y limpieza de faros.' },
    { nombre: 'Matteo F.', estrellas: 5, texto: 'Jóvenes, rápidos, utilizan excelentes materiales. Renovaron mi parabrisas con infiltración en menos de una hora, mientras tanto pude trabajar con el wifi. Lindo taller. No tengo lazos con ellos, me gusta nomás promocionar los que trabajan con pasión y profesionalismo.' },
    { nombre: 'Enrique B.', estrellas: 5, texto: 'Excelente atención, especialmente su equipo de instalación en tu domicilio u oficina. Y buenos precios.' },
  ],
  // Marcas de vidrio con las que trabajan. Agregá o quitá nombres de esta lista.
  marcasVidrio: ['Pilkington', 'Saint-Gobain Sekurit', 'XYG'],
  redes: { facebook: 'https://www.facebook.com/Parabrisascristalauto', instagram: 'https://www.instagram.com/cristalauto_', tiktok: 'https://www.tiktok.com/@cristalauto' },
};
