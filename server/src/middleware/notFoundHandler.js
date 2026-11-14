// PharmaTrace AI — 404 Route Not Found Handler

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
    path: req.originalUrl || req.url
  })
}
