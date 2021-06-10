package template

import (
	"html/template"
	"log"

	_ "embed"
)

//go:embed home.gohtml
var homeHTML string
var HomeTemplate *template.Template

func init() {
	var err error
	HomeTemplate, err = template.New("template").Funcs(funcs).Parse(homeHTML)
	if err != nil {
		log.Fatalf("failed to load home template: %s", err)
	}
}
