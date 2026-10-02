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
  redes: { facebook: '', instagram: '', tiktok: '' },
};
