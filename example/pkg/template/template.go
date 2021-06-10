package template

import (
	"encoding/base64"
	"html/template"
)

var funcs = template.FuncMap{
	"base64": func(in string) string {
		return base64.RawURLEncoding.EncodeToString([]byte(in))
	},
}
