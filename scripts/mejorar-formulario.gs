/**
 * "Estoy Para Más 2027 · Conocerte" — versión 2.
 * Correr UNA vez mejorarFormulario() en el mismo proyecto de Apps Script.
 * Conserva Código, Nombre, Email, WhatsApp, Compromiso y Apertura (los links prellenados
 * y el aviso al panel siguen funcionando) y rearma el resto: secciones, textos y todo obligatorio.
 */
var FORM_ID = '1zzekxdZLzDZieOVpmUTsnF1J1wTU0tH66KKhVJWRCQ4';

function mejorarFormulario() {
  var form = FormApp.openById(FORM_ID);
  var p = PropertiesService.getScriptProperties();
  var ids = { codigo: p.getProperty('CODIGO'), compromiso: p.getProperty('COMPROMISO'), apertura: p.getProperty('APERTURA') };

  // 1. Conservar los 6 campos clave y borrar el resto
  var keep = {};
  form.getItems().forEach(function (it) {
    var id = String(it.getId()), t = it.getTitle();
    if (id === ids.codigo) keep.codigo = it;
    else if (id === ids.compromiso) keep.compromiso = it;
    else if (id === ids.apertura) keep.apertura = it;
    else if (t === 'Nombre y apellido') keep.nombre = it;
    else if (t === 'Email') keep.email = it;
    else if (t === 'WhatsApp') keep.whatsapp = it;
    else form.deleteItem(it);
  });

  // 2. Portada y ajustes generales
  form.setTitle('Estoy Para Más 2027 · Conocerte 🤍');
  form.setDescription(
    '¡Qué alegría que vengas! Ya sos parte de Estoy Para Más.\n\n' +
    'Queremos conocerte antes del 6 de marzo para preparar cada momento pensando en vos: ' +
    'quién sos, qué te trae y qué te querés llevar.\n\n' +
    'Te lleva 3 minutos. No hay respuestas correctas, solo las tuyas. ' +
    'Lo que nos cuentes queda entre nosotras.\n\n' +
    '📅 Sábado 6 y domingo 7 de marzo de 2027 · 9 a 20 hs\n' +
    '📍 Capital Federal, Buenos Aires'
  );
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(false);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage(
    'Gracias por abrirte con nosotras 🤍\n\n' +
    'Ya tenemos tu perfil y vamos a preparar Estoy Para Más pensando en vos. ' +
    'Cada respuesta que leemos nos recuerda por qué hacemos esto.\n\n' +
    'Guardá tu entrada (te llegó por mail) y agendá: sábado 6 y domingo 7 de marzo, 9 hs.\n\n' +
    'Te espero con mucho amor,\nValen ✨'
  );

  // 3. Sección 1 · Tus datos
  var codigo = keep.codigo.asTextItem().setTitle('Código de reserva')
    .setHelpText('Se completa solo con el link de tu mail. Si está vacío, lo encontrás en el mail de tu reserva (empieza con EPM27).')
    .setRequired(true);
  var nombre = keep.nombre.asTextItem().setTitle('Nombre y apellido').setRequired(true);
  var email = keep.email.asTextItem().setTitle('Email').setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('Revisá que sea un email válido').build());
  var whatsapp = keep.whatsapp.asTextItem().setTitle('WhatsApp').setHelpText('Con código de área. Ej: 11 2044 2233').setRequired(true);
  var instagram = form.addTextItem().setTitle('Tu usuario de Instagram').setHelpText('Así te encontramos y te etiquetamos en las fotos del evento.').setRequired(true);
  var ciudad = form.addTextItem().setTitle('¿Desde qué ciudad venís?').setRequired(true);
  var edad = form.addMultipleChoiceItem().setTitle('Edad').setRequired(true)
    .setChoiceValues(['Menos de 25 años', '25 a 30 años', '31 a 35 años', '36 a 40 años', '41 a 50 años', 'Más de 50 años']);

  // 4. Sección 2 · Tu historia
  var s2 = form.addPageBreakItem().setTitle('Tu historia ✨')
    .setHelpText('Respondé con el corazón, sin pensarlo demasiado. Nadie te va a juzgar: esto es para preparar tu experiencia.');
  var conociste = form.addMultipleChoiceItem().setTitle('¿Cómo llegaste a Estoy Para Más?').setRequired(true)
    .setChoiceValues(['Instagram de Valentina', 'Me invitó una amiga', 'Soy alumna de Valentina', 'Fui a la primera edición']).showOtherOption(true);
  var conQuien = form.addMultipleChoiceItem().setTitle('¿Con quién venís?').setRequired(true)
    .setChoiceValues(['Sola (¡y feliz!)', 'Con una amiga', 'Con mi mamá, hermana o familiar', 'Con un grupo']);
  var limita = form.addParagraphTextItem().setTitle('¿Qué sentís que hoy es lo que más te limita?').setRequired(true);
  var meta = form.addParagraphTextItem().setTitle('¿Cuál es tu mayor meta en este momento?').setRequired(true);
  var dolor = form.addParagraphTextItem().setTitle('Si todo siguiera exactamente igual durante los próximos 5 años, ¿qué sería lo que más te dolería?').setRequired(true);
  var llevarte = form.addParagraphTextItem().setTitle('¿Qué te gustaría llevarte de esta experiencia?').setRequired(true);

  // 5. Sección 3 · Tu compromiso
  var s3 = form.addPageBreakItem().setTitle('Tu compromiso 🤍')
    .setHelpText('Estas últimas nos ayudan a acompañarte también después del evento.');
  var compromiso = keep.compromiso.asScaleItem()
    .setTitle('Del 1 al 10, ¿qué tan comprometida estás con construir una vida que realmente te represente?')
    .setBounds(1, 10).setLabels('Recién empiezo', 'Totalmente comprometida').setRequired(true);
  var apertura = keep.apertura.asMultipleChoiceItem()
    .setTitle('¿Qué tan abierta estás a seguir profundizando este trabajo después del evento?').setRequired(true);
  var cuidarte = form.addParagraphTextItem().setTitle('¿Hay algo que necesitemos saber para cuidarte durante esos dos días?')
    .setHelpText('Alimentación (vegetariana, celíaca, alergias), accesibilidad o lo que sea. Si no hay nada, escribí "Nada".').setRequired(true);
  var mensaje = form.addParagraphTextItem().setTitle('Si querés, dejale un mensaje a Valen 💌')
    .setHelpText('Lo que sientas. Ella lee cada uno. Si no querés dejar nada, escribí "Nos vemos" 🙂').setRequired(true);

  // 6. Sección 4 · Ya sos parte (antes de enviar)
  var s4 = form.addPageBreakItem().setTitle('Ya sos parte de Estoy Para Más ✨')
    .setHelpText(
      'Tu decisión de estar acá ya es una señal.\n\n' +
      'El 6 y 7 de marzo vas a compartir dos días de claridad, transformación y expansión ' +
      'junto a cientos de mujeres que también saben que están para más.\n\n' +
      'Tocá "Enviar" para guardar tu perfil. Nos vemos adentro.\n\n' +
      'Valen y equipo 🤍'
    );

  // 7. Orden final
  var orden = [codigo, nombre, email, whatsapp, instagram, ciudad, edad,
    s2, conociste, conQuien, limita, meta, dolor, llevarte,
    s3, compromiso, apertura, cuidarte, mensaje, s4];
  orden.forEach(function (it, i) { form.moveItem(it.getIndex(), i); });

  Logger.log('Listo: ' + form.getEditUrl());
}
