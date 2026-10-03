/* Datos del negocio. Para cambiar teléfono, horarios o redes, se edita solo este archivo. */
window.SITE = {
  nombre: 'CristalAuto Parabrisas',
  whatsapp: '595984102671',          // formato internacional, sin + ni espacios
  telefonoVisible: '0984 102 671',
  telefonoLink: '+595984102671',
  direccion: 'Calle Nicanor Ríos, San Lorenzo, Paraguay',
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
    enlace: '',          // link de CristalAuto en Google Maps (para el botón "Ver todas las reseñas")
    calificacion: null,  // ej: 4.8   (la que muestra Google)
    total: null,         // ej: 57    (cantidad total de reseñas en Google)
  },
  resenas: [],           // ej: [{ nombre: 'Juan P.', fecha: 'hace 2 semanas', estrellas: 5, texto: 'Excelente atención' }]
  redes: { facebook: '', instagram: '', tiktok: '' },
};
