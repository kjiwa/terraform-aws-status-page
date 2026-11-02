output "alarm_names" {
  description = "Names of the disk alarms this module creates. Derived from inputs only, so a consumer can pass them to modules/availability's alarm_publishers without a dependency cycle."
  value       = local.alarm_names
}
