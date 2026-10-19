/**
 * Formulario "Estoy Para Más 2027 · Conocerte".
 * Correr UNA vez la función crearFormulario() desde script.google.com.
 * Crea el formulario, la planilla de respuestas y el aviso a la web
 * (cada envío marca "Perfil ✓" en el panel).
 */
var WEB = 'https://www.valentinaparodi.com/api/perfil';

function crearFormulario() {
  var form = FormApp.create('Estoy Para Más 2027 · Conocerte');
  form.setDescription('¡Qué alegría que vengas! 🤍 Contanos un poco de vos para preparar Estoy Para Más pensando en vos. Te lleva 2 minutos.');
  form.setConfirmationMessage('¡Gracias! 🤍 Ya tenemos tu perfil. Nos vemos el 6 de marzo.');
  form.setShowLinkToRespondAgain(false);

  var codigo = form.addTextItem().setTitle('Código de reserva').setHelpText('Se completa solo. No lo cambies.');
  var nombre = form.addTextItem().setTitle('Nombre y apellido').setRequired(true);
  var email = form.addTextItem().setTitle('Email').setRequired(true);
  var whatsapp = form.addTextItem().setTitle('WhatsApp').setRequired(true);

  form.addSectionHeaderItem().setTitle('Sobre vos');
  form.addTextItem().setTitle('Usuario de Instagram');
  form.addTextItem().setTitle('Ciudad de residencia');
  form.addMultipleChoiceItem().setTitle('Edad')
    .setChoiceValues(['Menos de 25 años', '25 a 30 años', '31 a 35 años', '36 a 40 años', '41 a 50 años', 'Más de 50 años']);
  form.addMultipleChoiceItem().setTitle('¿Cómo conociste Estoy Para Más?')
    .setChoiceValues(['Instagram', 'Una amiga', 'Soy alumna de Valentina', 'Fui a la primera edición'])
    .showOtherOption(true);
  form.addTextItem().setTitle('¿Por quién conocés este evento?');

  form.addSectionHeaderItem().setTitle('Lo que hay adentro');
  form.addParagraphTextItem().setTitle('¿Qué sentís que hoy es lo que más te limita?').setRequired(true);
  form.addParagraphTextItem().setTitle('¿Cuál es tu mayor meta actualmente?');
  form.addParagraphTextItem().setTitle('Si todo siguiera exactamente igual durante los próximos 5 años, ¿qué sería lo que más te dolería?');
  form.addParagraphTextItem().setTitle('¿Qué te gustaría llevarte de esta experiencia?');

  form.addSectionHeaderItem().setTitle('Tu compromiso');
  var compromiso = form.addScaleItem().setTitle('Del 1 al 10, ¿qué tan comprometida estás con construir una vida que realmente te represente?')
    .setBounds(1, 10).setRequired(true);
  var apertura = form.addMultipleChoiceItem().setTitle('¿Qué tan abierta estás a seguir profundizando este trabajo después del evento?')
    .setChoiceValues(['Muy abierta', 'Bastante abierta', 'Depende de la experiencia', 'Por ahora no']).setRequired(true);

  var hoja = SpreadsheetApp.create('Estoy Para Más 2027 · Conocerte (respuestas)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, hoja.getId());

  var props = PropertiesService.getScriptProperties();
  props.setProperties({ CODIGO: String(codigo.getId()), COMPROMISO: String(compromiso.getId()), APERTURA: String(apertura.getId()) });
  ScriptApp.newTrigger('alEnviar').forForm(form).onFormSubmit().create();

  var pre = form.createResponse()
    .withItemResponse(codigo.createResponse('CODIGO'))
    .withItemResponse(nombre.createResponse('NOMBRE'))
    .withItemResponse(email.createResponse('EMAIL'))
    .withItemResponse(whatsapp.createResponse('WHATSAPP'))
    .toPrefilledUrl();

  Logger.log('FORMULARIO: ' + form.getPublishedUrl());
  Logger.log('PRELLENADO: ' + pre);
  Logger.log('PLANILLA: ' + hoja.getUrl());
}

function alEnviar(e) {
  var props = PropertiesService.getScriptProperties();
  var datos = {};
  e.response.getItemResponses().forEach(function (r) {
    var id = String(r.getItem().getId());
    if (id === props.getProperty('CODIGO')) datos.reference = String(r.getResponse());
    if (id === props.getProperty('COMPROMISO')) datos.commitment = Number(r.getResponse());
    if (id === props.getProperty('APERTURA')) datos.openness = String(r.getResponse());
  });
  if (!datos.reference) return;
  UrlFetchApp.fetch(WEB, { method: 'post', contentType: 'application/json', payload: JSON.stringify(datos), muteHttpExceptions: true });
}
