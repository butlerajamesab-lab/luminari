/**
 * Lazily expose an object without changing the receiver of its methods.
 *
 * A plain forwarding Proxy returns unbound methods. Calling one through the
 * proxy then makes `this` the proxy target, so assignments inside the method
 * can mutate the facade instead of the real instance. Pool implementations in
 * particular replace internal arrays while removing errored clients.
 */
export function create_receiver_bound_lazy_proxy<T extends object>(
  get_instance: () => T,
): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = get_instance();
      const value = Reflect.get(instance, property, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, property, value) {
      const instance = get_instance();
      return Reflect.set(instance, property, value, instance);
    },
  });
}
