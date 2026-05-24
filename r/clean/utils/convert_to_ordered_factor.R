# Function to convert variables to factors with specified ordering
convert_to_ordered_factor <- function(data, var_name, order_levels) {
  data %>%
    mutate({{var_name}} := factor({{var_name}}, levels = order_levels))
}
