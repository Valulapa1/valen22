/**
 * Formulario "Estoy Para Más 2027 · Invitadas" (entrada sin cargo).
 * Correr UNA vez crearInvitadas(). Las respuestas van solo a su planilla (no al panel).
 */
function crearInvitadas() {
  var form = FormApp.create('Estoy Para Más 2027 · Invitadas 🤍');
  form.setTitle('Estoy Para Más 2027 · Invitadas 🤍');
  form.setDescription(
    '¡Alguien que te quiere te regaló un lugar en Estoy Para Más! ✨\n\n' +
    'Completá este formulario para registrarte como invitada. Así preparamos todo pensando también en vos.\n\n' +
    'Te lleva 3 minutos. No hay respuestas correctas, solo las tuyas. Lo que nos cuentes queda entre nosotras.\n\n' +
    '📅 Sábado 6 y domingo 7 de marzo de 2027 · 9 a 20 hs\n' +
    '📍 Capital Federal, Buenos Aires (la dirección exacta te llega unos días antes)'
  );
  form.setProgressBar(true);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage(
    '¡Listo, ya estás registrada como invitada! 🤍\n\n' +
    'Gracias por abrirte con nosotras. Unos días antes te escribimos con la dirección exacta y todo lo que necesitás saber.\n\n' +
    'Agendá: sábado 6 y domingo 7 de marzo, 9 hs.\n\n' +
    'Te espero con mucho amor,\nValen ✨'
  );

  // Sección 1 · Tus datos
  form.addTextItem().setTitle('Nombre y apellido').setRequired(true);
  form.addTextItem().setTitle('Email').setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('Revisá que sea un email válido').build());
  form.addTextItem().setTitle('WhatsApp').setHelpText('Con código de área. Ej: 11 2044 2233').setRequired(true);
  form.addTextItem().setTitle('Tu usuario de Instagram').setHelpText('Así te encontramos y te etiquetamos en las fotos del evento.').setRequired(true);
  form.addTextItem().setTitle('¿Desde qué ciudad venís?').setRequired(true);
  form.addMultipleChoiceItem().setTitle('Edad').setRequired(true)
    .setChoiceValues(['Menos de 25 años', '25 a 30 años', '31 a 35 años', '36 a 40 años', '41 a 50 años', 'Más de 50 años']);

  // Sección 2 · Tu invitación
  form.addPageBreakItem().setTitle('Tu invitación 🎁').setHelpText('Contanos quién te regaló este lugar.');
  form.addTextItem().setTitle('¿Quién te invitó? (nombre y apellido)').setRequired(true);
  form.addMultipleChoiceItem().setTitle('Esa persona es…').setRequired(true)
    .setChoiceValues(['Valentina o alguien de su equipo', 'Una ponente del evento', 'Una asistente que compró su entrada', 'Una marca o sponsor'])
    .showOtherOption(true);
  form.addMultipleChoiceItem().setTitle('¿Qué días venís?').setRequired(true)
    .setChoiceValues(['Los dos días (¡lo recomendamos!)', 'Solo el sábado 6', 'Solo el domingo 7']);

  // Sección 3 · Tu historia
  form.addPageBreakItem().setTitle('Tu historia ✨')
    .setHelpText('Respondé con el corazón, sin pensarlo demasiado. Nadie te va a juzgar: esto es para preparar tu experiencia.');
  form.addParagraphTextItem().setTitle('¿Qué sentís que hoy es lo que más te limita?').setRequired(true);
  form.addParagraphTextItem().setTitle('¿Cuál es tu mayor meta en este momento?').setRequired(true);
  form.addParagraphTextItem().setTitle('¿Qué te gustaría llevarte de esta experiencia?').setRequired(true);

  // Sección 4 · Tu compromiso
  form.addPageBreakItem().setTitle('Tu compromiso 🤍').setHelpText('Las últimas, y terminamos.');
  form.addScaleItem().setTitle('Del 1 al 10, ¿qué tan comprometida estás con construir una vida que realmente te represente?')
    .setBounds(1, 10).setLabels('Recién empiezo', 'Totalmente comprometida').setRequired(true);
  form.addMultipleChoiceItem().setTitle('¿Qué tan abierta estás a seguir profundizando este trabajo después del evento?').setRequired(true)
    .setChoiceValues(['Muy abierta', 'Bastante abierta', 'Depende de la experiencia', 'Por ahora no']);
  form.addParagraphTextItem().setTitle('¿Hay algo que necesitemos saber para cuidarte durante el evento?')
    .setHelpText('Alimentación (vegetariana, celíaca, alergias), accesibilidad o lo que sea. Si no hay nada, escribí "Nada".').setRequired(true);

  // Sección 5 · Ya sos parte
  form.addPageBreakItem().setTitle('Ya sos parte de Estoy Para Más ✨').setHelpText(
    'Que alguien haya pensado en vos para este lugar ya dice mucho.\n\n' +
    'El 6 y 7 de marzo vas a compartir dos días de claridad, transformación y expansión ' +
    'junto a cientos de mujeres que también saben que están para más.\n\n' +
    'Tocá "Enviar" para registrarte. Nos vemos adentro.\n\n' +
    'Valen y equipo 🤍'
  );

  var hoja = SpreadsheetApp.create('Estoy Para Más 2027 · Invitadas (respuestas)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, hoja.getId());

  Logger.log('INVITADAS_FORM: ' + form.getPublishedUrl());
  Logger.log('INVITADAS_EDIT: ' + form.getEditUrl());
  Logger.log('INVITADAS_PLANILLA: ' + hoja.getUrl());
}
