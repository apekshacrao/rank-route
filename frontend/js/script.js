// js file
function predict(){

let html = `
<table class="table table-bordered">

<tr>
<th>College</th>
<th>Branch</th>
<th>Cutoff</th>
<th>Chance</th>
</tr>

<tr>
<td>RVCE</td>
<td>CSE</td>
<td>1200</td>
<td class="text-danger">Low</td>
</tr>

<tr>
<td>BMSCE</td>
<td>CSE</td>
<td>2500</td>
<td class="text-warning">Medium</td>
</tr>

<tr>
<td>MSRIT</td>
<td>CSE</td>
<td>3200</td>
<td class="text-success">High</td>
</tr>

</table>
`;

document.getElementById("result").innerHTML = html;

}

if(document.getElementById("compareChart")){

new Chart(compareChart,{

type:'bar',

data:{
labels:["RVCE","BMSCE"],
datasets:[{
label:"Average Salary (LPA)",
data:[18,14]
}]
}

})

}

if(document.getElementById("cutoffChart")){

new Chart(cutoffChart,{

type:'line',

data:{
labels:["2020","2021","2022","2023","2024"],
datasets:[{
label:"CSE Cutoff",
data:[1200,1300,1100,1000,900]
}]
}

})

}
