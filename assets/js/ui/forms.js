/**
 * Validação e envio dos formulários.
 *
 * O backend continua sendo o StaticForms (mesma chave de acesso já em uso no
 * site atual), então nada precisa ser provisionado. A diferença é o envio por
 * fetch: o visitante recebe confirmação na própria página em vez de ser jogado
 * num redirect. Sem JS, o form volta a fazer POST nativo com `redirectTo`.
 */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const MSG = {
  required: 'Preencha este campo.',
  email: 'Informe um e-mail válido.',
  tel: 'Informe um telefone com DDD.',
  minlength: 'Detalhe um pouco mais, por favor.',
};

/** Máscara progressiva de telefone brasileiro: (11) 98488-5002. */
function maskPhone(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{0,2})/, '($1');
  if (d.length <= 6) return d.replace(/(\d{2})(\d{0,4})/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

function fieldOf(input) {
  return input.closest('.field');
}

function setError(input, msg) {
  const field = fieldOf(input);
  if (!field) return;
  const slot = field.querySelector('.field__err');
  field.classList.toggle('is-invalid', Boolean(msg));
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (slot) slot.textContent = msg || '';
}

function validate(input) {
  const v = input.value.trim();

  if (input.required && !v) {
    setError(input, MSG.required);
    return false;
  }
  if (!v) {
    setError(input, '');
    return true;
  }
  if (input.type === 'email' && !RE_EMAIL.test(v)) {
    setError(input, MSG.email);
    return false;
  }
  if (input.type === 'tel' && v.replace(/\D/g, '').length < 10) {
    setError(input, MSG.tel);
    return false;
  }
  const min = parseInt(input.getAttribute('minlength') || '0', 10);
  if (min && v.length < min) {
    setError(input, MSG.minlength);
    return false;
  }

  setError(input, '');
  return true;
}

function status(form, kind, text) {
  const box = form.querySelector('.form__status');
  if (!box) return;
  box.classList.remove('is-ok', 'is-err');
  box.classList.add('is-on', kind === 'ok' ? 'is-ok' : 'is-err');
  const slot = box.querySelector('[data-status-text]');
  if (slot) slot.textContent = text;
  box.setAttribute('role', kind === 'ok' ? 'status' : 'alert');
}

export function initForms() {
  document.querySelectorAll('form[data-form]').forEach((form) => {
    const inputs = [...form.querySelectorAll('input:not([type=hidden]), textarea, select')].filter(
      (el) => !el.closest('.honeypot'),
    );
    const submit = form.querySelector('[type=submit]');
    const original = submit?.textContent;

    inputs.forEach((input) => {
      if (input.type === 'tel') {
        input.addEventListener('input', () => {
          input.value = maskPhone(input.value);
        });
      }
      input.addEventListener('blur', () => validate(input));
      input.addEventListener('input', () => {
        if (fieldOf(input)?.classList.contains('is-invalid')) validate(input);
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const bad = inputs.filter((input) => !validate(input));
      if (bad.length) {
        bad[0].focus({ preventScroll: false });
        status(form, 'err', `Revise ${bad.length === 1 ? 'o campo destacado' : 'os campos destacados'} antes de enviar.`);
        return;
      }

      const data = new FormData(form);
      // Com fetch queremos a resposta JSON, não o redirect do serviço.
      data.delete('redirectTo');

      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Enviando…';
      }

      try {
        const res = await fetch(form.action, { method: 'POST', body: data });
        let ok = res.ok;
        try {
          const json = await res.clone().json();
          if (typeof json?.success === 'boolean') ok = json.success;
        } catch {
          /* resposta não-JSON: vale o status HTTP */
        }

        if (!ok) throw new Error(`HTTP ${res.status}`);

        form.reset();
        status(
          form,
          'ok',
          'Mensagem enviada. Nossa equipe responde em horário comercial — se for urgente, chame no WhatsApp (11) 98488-5002.',
        );
        inputs.forEach((input) => setError(input, ''));
      } catch {
        status(
          form,
          'err',
          'Não foi possível enviar agora. Fale com a gente pelo WhatsApp (11) 98488-5002 ou por contato@wayultimamilha.com.br.',
        );
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = original;
        }
      }
    });
  });
}
