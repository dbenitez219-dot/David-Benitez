/* Catálogo de vehículos (LISTA DE EJEMPLO).
   Cuando me pases el Excel del inventario, esta lista se reemplaza por la real,
   con los años y el código de cada vidrio.

   FOTOS REALES de cada modelo: se guardan en  img/autos/<marca>-<modelo>/  con estos nombres:
       frente.jpg   (el auto visto de frente, con el parabrisas)
       atras.jpg    (el auto visto de atrás, con la luneta)
       lado.jpg     (el auto visto de costado, con las puertas)
   Ejemplo para el Toyota Vitz:  img/autos/toyota-vitz/frente.jpg, atras.jpg y lado.jpg
   Si falta una foto, la página muestra un dibujo del tipo de vehículo.

   Opcional: HIGHLIGHT marca el vidrio sobre la foto (puntos en porcentaje, de 0 a 100). */
window.CATALOGO = {
  'Toyota':      { 'Vitz': 'Hatchback', 'Yaris': 'Hatchback', 'Passo': 'Hatchback', 'IST': 'Hatchback', 'Corolla': 'Sedán', 'Allion': 'Sedán', 'Premio': 'Sedán', 'Probox': 'Furgón / utilitario', 'RAV4': 'SUV / Camioneta', 'Fortuner': 'SUV / Camioneta', 'Hilux': 'Camioneta pick-up', 'Hiace': 'Furgón / utilitario' },
  'Nissan':      { 'March': 'Hatchback', 'Note': 'Hatchback', 'Sentra': 'Sedán', 'Versa': 'Sedán', 'X-Trail': 'SUV / Camioneta', 'Kicks': 'SUV / Camioneta', 'Frontier': 'Camioneta pick-up' },
  'Honda':       { 'Fit': 'Hatchback', 'Civic': 'Sedán', 'City': 'Sedán', 'CR-V': 'SUV / Camioneta', 'HR-V': 'SUV / Camioneta' },
  'Hyundai':     { 'i10': 'Hatchback', 'HB20': 'Hatchback', 'Accent': 'Sedán', 'Elantra': 'Sedán', 'Tucson': 'SUV / Camioneta', 'Santa Fe': 'SUV / Camioneta', 'H1': 'Furgón / utilitario' },
  'Kia':         { 'Picanto': 'Hatchback', 'Cerato': 'Sedán', 'Sportage': 'SUV / Camioneta', 'Sorento': 'SUV / Camioneta' },
  'Suzuki':      { 'Swift': 'Hatchback', 'Alto': 'Hatchback', 'Ignis': 'Hatchback', 'Vitara': 'SUV / Camioneta', 'Jimny': 'SUV / Camioneta' },
  'Volkswagen':  { 'Gol': 'Hatchback', 'Polo': 'Hatchback', 'Golf': 'Hatchback', 'New Beetle': 'Hatchback', 'Vento': 'Sedán', 'Tiguan': 'SUV / Camioneta', 'Amarok': 'Camioneta pick-up', 'Saveiro': 'Camioneta pick-up' },
  'Chevrolet':   { 'Corsa': 'Hatchback', 'Onix': 'Hatchback', 'Cruze': 'Sedán', 'Tracker': 'SUV / Camioneta', 'S10': 'Camioneta pick-up' },
  'Ford':        { 'Ka': 'Hatchback', 'Fiesta': 'Hatchback', 'Focus': 'Hatchback', 'EcoSport': 'SUV / Camioneta', 'Ranger': 'Camioneta pick-up' },
  'Mitsubishi':  { 'Lancer': 'Sedán', 'ASX': 'SUV / Camioneta', 'Outlander': 'SUV / Camioneta', 'L200': 'Camioneta pick-up' },
  'Mazda':       { 'Demio': 'Hatchback', 'CX-5': 'SUV / Camioneta', 'BT-50': 'Camioneta pick-up' },
  'Fiat':        { 'Uno': 'Hatchback', 'Palio': 'Hatchback', 'Siena': 'Sedán', 'Strada': 'Camioneta pick-up' },
  'Renault':     { 'Kwid': 'Hatchback', 'Sandero': 'Hatchback', 'Logan': 'Sedán', 'Duster': 'SUV / Camioneta' },
  'Peugeot':     { '208': 'Hatchback', '308': 'Hatchback', '2008': 'SUV / Camioneta' },
  'Subaru':      { 'Forester': 'SUV / Camioneta', 'XV': 'SUV / Camioneta' },
  'Jeep':        { 'Renegade': 'SUV / Camioneta', 'Compass': 'SUV / Camioneta' },
  'Isuzu':       { 'D-Max': 'Camioneta pick-up' }
};

/* Vidrio marcado sobre la foto real. Ejemplo (cuando exista la foto):
   window.HIGHLIGHT = { 'toyota-vitz': { parabrisas: [[22,30],[78,30],[84,52],[16,52]] } }   */
window.HIGHLIGHT = {};
