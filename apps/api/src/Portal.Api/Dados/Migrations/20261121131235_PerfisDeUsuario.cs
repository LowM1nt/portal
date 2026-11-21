using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Portal.Api.Dados.Migrations
{
    /// <inheritdoc />
    public partial class PerfisDeUsuario : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "perfis_usuario",
                columns: table => new
                {
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    github_login = table.Column<string>(type: "character varying(39)", maxLength: 39, nullable: true),
                    atualizado_em = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_perfis_usuario", x => x.usuario_id);
                });
            // Mesma regra da auditoria de 20/11: tabela nova nasce com RLS ligado (bloqueia a API REST do Supabase).
            migrationBuilder.Sql("ALTER TABLE perfis_usuario ENABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "perfis_usuario");
        }
    }
}
