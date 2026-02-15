/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 * 
 * Usage:
 * router.get('/orders', asyncHandler(async (req, res) => {
 *   const orders = await orderService.getAll();
 *   res.json(orders);
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
