/**
 * Stand-in for Paystack's inline script (https://js.paystack.co/v1/inline.js).
 *
 * The end-to-end tests serve this file in place of the real script, so the
 * checkout runs its own code right up to the moment the customer would see
 * Paystack's card form, without calling Paystack or charging anything.
 *
 * It records what the website handed to Paystack and leaves the outcome to
 * the test:
 *
 *   window.__paystack.opened      how many times the card form was opened
 *   window.__paystack.options     what the last PaystackPop.setup() was given
 *                                 (key, email, amount in kobo, ref, metadata…)
 *   window.__paystack.pay()       the customer paid: runs `callback` with the
 *                                 reference the site asked for, as Paystack does
 *   window.__paystack.close()     the customer shut the form: runs `onClose`
 *
 * Plain script, no modules: it is loaded by a <script src> tag.
 */
(function () {
  var state = {
    opened: 0,
    options: null,
    pay: function (reference) {
      if (!state.options) throw new Error("Paystack was never opened");
      state.options.callback({ reference: reference || state.options.ref, status: "success" });
      // The real popup closes itself after a payment, which also runs
      // onClose; the site must not treat that as "closed without paying".
      if (typeof state.options.onClose === "function") state.options.onClose();
    },
    close: function () {
      if (!state.options) throw new Error("Paystack was never opened");
      if (typeof state.options.onClose === "function") state.options.onClose();
    },
  };

  window.__paystack = state;
  window.PaystackPop = {
    setup: function (options) {
      state.options = options;
      return {
        openIframe: function () {
          state.opened += 1;
        },
      };
    },
  };
})();
