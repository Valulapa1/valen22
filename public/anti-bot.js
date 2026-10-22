/* Filtro anti-bots invisible para todos los formularios de la web.
   - Agrega a cada formulario un campo oculto ("website"). Una persona no lo
     ve ni lo completa; los bots completan todo, y así se delatan.
   - Mide cuánto tardó en mandar el formulario desde que abrió la página.
   - Ofrece epmPhoneOk() para validar el WhatsApp (mismas reglas que el servidor).
   No cambia nada de lo que ve una persona real. */
(function(){
  var t0 = Date.now();

  function addTrap(form){
    if (form.querySelector('input[name="epm_hp_confirm"]')) return;
    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden','true');
    wrap.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden';
    wrap.innerHTML = '<label>No completar<input type="text" name="epm_hp_confirm" tabindex="-1" autocomplete="off"></label>';
    form.appendChild(wrap);
  }
  function scan(){ document.querySelectorAll('form').forEach(addTrap); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  // Formularios que aparecen después (ventanas emergentes).
  new MutationObserver(scan).observe(document.documentElement, { childList:true, subtree:true });

  function trapValue(){
    var v = '';
    document.querySelectorAll('input[name="epm_hp_confirm"]').forEach(function(i){ if (i.value) v = i.value; });
    return v;
  }

  // A cada envío a /api/leads o /api/reservas le sumamos el campo trampa y el tiempo.
  var origFetch = window.fetch;
  window.fetch = function(input, init){
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/\/api\/(leads|reservas)(\?|$)/.test(url) && init && typeof init.body === 'string') {
        var data = JSON.parse(init.body);
        data.website = trapValue();
        data.elapsedMs = Date.now() - t0;
        init = Object.assign({}, init, { body: JSON.stringify(data) });
      }
    } catch (e) {}
    return origFetch.call(this, input, init);
  };

  /* WhatsApp válido: con "+" y código de país, o un número argentino
     (los códigos de área de Argentina empiezan con 1, 2 o 3). */
  window.epmPhoneOk = function(phone){
    var raw = String(phone || '').trim(), d = raw.replace(/\D/g, '');
    if (raw.charAt(0) === '+') return d.length >= 8 && d.length <= 15;
    if (d.indexOf('549') === 0) d = d.slice(3);
    else if (d.indexOf('54') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0') d = d.slice(1);
    return d.length >= 8 && d.length <= 13 && /^[123]/.test(d);
  };
  window.epmPhoneMsg = 'Si no sos de Argentina, poné tu WhatsApp con el código de país (ej. +52...).';
})();
